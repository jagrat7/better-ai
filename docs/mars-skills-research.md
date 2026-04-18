# Research: How `mars-agents` fetches skills directly from dependency GitHub repos

> Source of truth for this writeup: the [`meridian-flow/mars-agents`](https://github.com/meridian-flow/mars-agents) repository (Rust CLI, `mars`). Everything here is cross‑referenced against that repo. No conclusions are inferred without pointing at the specific module that implements them.

## 1. TL;DR

`mars-agents` is essentially **a package manager for AI agents and skills**. Instead of shelling out to a third‑party installer like `skills@latest add …` (the approach `bttrai` takes today), it:

1. Lets the user declare dependency **GitHub repos** (plus optional version constraints and filters) in a `mars.toml`.
2. Resolves each dependency to an **exact commit SHA** (via `git ls-remote`), records it in a `mars.lock`.
3. **Fetches the repo contents** either as a GitHub tarball (preferred) or via `git` CLI clone into a global cache at `~/.mars/cache`.
4. **Discovers** the agents/skills inside the fetched tree using a set of filesystem conventions (`agents/*.md`, `skills/<name>/SKILL.md`, plugin manifests, heuristic fallbacks).
5. Writes the resolved items into a gitignored canonical store `.mars/`, and then **copies** them into every configured target directory (`.agents/`, `.claude/`, `.codex/`, `.cursor/`, …) using atomic tmp+rename operations.
6. Tracks every file it wrote in `mars.lock`, so `mars sync` can cleanly update, add, or remove items without ever touching files it didn't create.

The net effect: **any GitHub repo that follows the conventional skills layout becomes a skills source**, with deterministic resolution, a lock file, and no server-side registry required. That is the mechanism we would mirror in `bttrai` to move off of `skills@latest add <source>` and talk to GitHub directly.

---

## 2. The core data model

### 2.1 `mars.toml` — consumer config

From [`docs/configuration.md`](https://github.com/meridian-flow/mars-agents/blob/main/docs/configuration.md) and `src/config/mod.rs`:

```toml
[dependencies.base]
url = "https://github.com/meridian-flow/meridian-base"
version = "^1.0"

[dependencies.ops]
url = "https://github.com/acme/ops-agents"
agents = ["deployer", "monitor"]
skills = ["deploy-flow"]

[dependencies.toolkit]
url = "https://github.com/acme/toolkit"
only_skills = true

[dependencies.dev]
path = "../my-dev-agents"     # local path deps are also allowed
```

The internal type is `InstallDep`:

```rust
// src/config/mod.rs
pub struct InstallDep {
    pub url: Option<SourceUrl>,          // exactly one of url/path
    pub path: Option<PathBuf>,
    pub subpath: Option<SourceSubpath>,  // monorepo escape hatch
    pub version: Option<String>,         // semver constraint like "^1.0"
    #[serde(flatten)]
    pub filter: FilterConfig,            // include/exclude/rename rules
}
```

Filters supported: `agents = [...]`, `skills = [...]`, `exclude = [...]`, `only_skills`, `only_agents`, `rename = { old = "new" }`. Mutually exclusive combinations are rejected at config load time (see the table in `docs/configuration.md`).

### 2.2 `mars.lock` — the authority on what mars manages

From `src/lock/mod.rs`:

```rust
pub struct LockFile {
    pub version: u32,
    pub dependencies: IndexMap<SourceName, LockedSource>, // resolved sources
    pub items: IndexMap<DestPath, LockedItem>,            // every installed file
}

pub struct LockedSource {
    pub url: Option<SourceUrl>,
    pub path: Option<String>,
    pub subpath: Option<SourceSubpath>,
    pub version: Option<String>,
    pub commit: Option<CommitHash>,   // <-- pinned commit SHA
    pub tree_hash: Option<String>,    // reserved for future tree hashing
}

pub struct LockedItem {
    pub source: SourceName,
    pub kind: ItemKind,               // Agent | Skill
    // version, source_checksum (sha256), installed_checksum, dest_path, …
}
```

Representative lock entry (from the mars repo itself):

```toml
[dependencies.anthropic-skills]
url = "https://github.com/anthropics/skills"
commit = "2c7ec5e78b8e5d43ea02e90bb8826f6b9f147b0c"

[items."agents/architect.md"]
source = "meridian-dev-workflow"
kind = "agent"
version = "v0.0.27"
source_checksum   = "sha256:82c7…1478c"
installed_checksum = "sha256:82c7…1478c"
dest_path = "agents/architect.md"
```

Two consequences:

- **Reproducibility**: every consumer resolves to the exact same commit + byte contents until they explicitly `mars upgrade`.
- **Safe ownership**: only files recorded in `mars.lock` are ever touched by mars. Orphan cleanup is driven off the *previous* lock, not a filesystem scan — mars will never delete something it didn't originally write. This is an explicit invariant in `AGENTS.md` / `CLAUDE.md`.

### 2.3 `.mars/` canonical store and target fan‑out

```
mars.toml + mars.lock   (committed, source of truth)
        ↓ mars sync
    .mars/              (gitignored cache, rebuilt from sources)
        ↓ copy
    .agents/, .claude/, .codex/, .cursor/   (shared with hand-written files)
```

Targets come from `settings.targets` in `mars.toml` (default `[".agents"]`). Copies are always file copies (no symlinks) and are atomic (see §4.2).

---

## 3. How a GitHub repo becomes a fetched source

All fetch logic lives in `src/source/`:

| File | Role |
|---|---|
| `src/source/mod.rs` | `GlobalCache` (`~/.mars/cache`, overridable via `MARS_CACHE_DIR`), `ResolvedRef`, `AvailableVersion`, `list_versions` entrypoint. |
| `src/source/parse.rs` | URL / shorthand parsing: `github:owner/repo`, `gitlab:…`, tree URLs, SSH, plain HTTPS. |
| `src/source/git.rs` | High‑level fetch strategy — decides "archive" vs "git CLI", resolves version → SHA, normalizes URLs to cache dirnames. |
| `src/source/git_cli.rs` | Thin wrapper over the `git` binary: `ls-remote`, `ls-remote --tags`, clone, fetch, checkout. |
| `src/source/archive.rs` | GitHub tarball download + tar.gz extraction into the cache, with HTTP retry for 429s. |
| `src/source/path.rs` | Local filesystem `path = …` deps. |

### 3.1 Resolving version → commit SHA

`src/source/git.rs::resolve_version` is the only code path that turns a user-supplied `version` into a concrete commit:

```rust
fn resolve_version(url, version_req, diag) -> ResolvedVersion {
    if let Some(req) = version_req {
        if let Some(requested) = parse_semver_tag(req) {
            // matches "v1.0.0" or "1.0.0"; annotated tags filtered out
            let tags = git_cli::ls_remote_tags(url)?;
            let selected = tags.into_iter()
                .find(|t| t.tag == req || t.version == requested)?;
            return ResolvedVersion { tag, version, sha: selected.commit_id };
        }
        // non-semver ref (branch, tag name, SHA) → ls-remote <ref>
        let sha = git_cli::ls_remote_ref(url, req)?;
        return ResolvedVersion { tag: None, version: None, sha };
    }

    // no version → latest semver tag, or HEAD on default branch
    let tags = git_cli::ls_remote_tags(url)?;
    if let Some(selected) = tags.last() { return …; }
    diag.warn("no-releases", "… using latest commit from default branch");
    let sha = git_cli::ls_remote_head(url)?;
    …
}
```

Key properties:

- Only authoritative source of versions is `git ls-remote --tags <url>` — no registry API, no JSON endpoint.
- Semver parsing accepts `v1.0.0` / `1.0.0`; rejects `latest`, `nightly-2024`, etc. (`parse_semver_tag`).
- Annotated tags are de‑duplicated by dropping peeled `^{}` entries.
- Falls back to default‑branch HEAD when a repo has no semver tags, with a structured diagnostic.

### 3.2 Tarball vs git CLI

`src/source/git.rs` decides which strategy to use:

```rust
fn should_use_github_archive(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.starts_with("git@") || trimmed.starts_with("ssh://") { return false; }
    trimmed.starts_with("https://") && is_github_host(trimmed)
}
```

So the flow for a typical `https://github.com/owner/repo` dep is:

1. `ls-remote --tags` → pick SHA.
2. Hit `https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>` (via `archive::github_owner_repo` + `download_archive_bytes`) with up to 3 retries on HTTP 429.
3. Stream the tarball through `flate2::GzDecoder` + `tar::Archive` into the cache at `~/.mars/cache/archives/<url_to_dirname(url)>/<sha>/…`.
4. For non‑GitHub URLs (SSH, `git://`, GitLab custom hosts, etc.), fall back to a proper `git clone` + `git checkout <sha>` under `~/.mars/cache/git/<url_to_dirname(url)>`.

`url_to_dirname` is the canonical cache key: `https://github.com/foo/bar` → `github.com_foo_bar`, which yields a stable on‑disk name regardless of whether the URL was written as SSH, `github:foo/bar`, or HTTPS.

### 3.3 Subpaths for monorepos

`InstallDep.subpath` / `ManifestDep.subpath` is respected after fetch — discovery runs against `<cache_tree>/<subpath>` instead of the repo root. This is how mars supports monorepos that put skills in e.g. `packages/skills/`.

---

## 4. How items are discovered inside a fetched tree

All discovery lives in `src/discover/mod.rs`. Two modes:

### 4.1 Convention-based discovery (`discover_source`)

If the fetched tree has its own `mars.toml`, mars trusts the package layout:

- `agents/*.md` → one agent per markdown file.
- `skills/<name>/` → one skill per directory (the skill is the whole directory, `SKILL.md` being the primary entrypoint).
- Hidden subdirs (`.curated`, `.experimental`) are walked as nested skill containers.
- Recursion skips `node_modules`, `.git`, `dist`, `build`, `__pycache__`.

### 4.2 Fallback for repos that don't know about mars (`discover_fallback`)

This is the path that makes third‑party skills repos (e.g. `anthropics/skills`, `vercel-labs/skills`) "just work". In priority order:

1. Root `SKILL.md` → treat the whole repo as a single skill.
2. **Plugin manifests**: read `.claude-plugin/plugin.json` / `marketplace.json` and use their declared `skills`, `skill_paths`, `skillPaths`, `agents`, `agent_paths`, `agentPaths` arrays.
3. **Heuristic walk**: breadth‑first scan, bounded by `MAX_HEURISTIC_FS_DEPTH`, looking for known container roots:

   ```rust
   const SKILL_CONTAINER_ROOTS: &[&str] = &[
       "skills",
       "skills/.curated",
       "skills/.experimental",
       "skills/.system",
       ".claude/skills",
       ".codex/skills",
       ".agents/skills",
   ];
   const AGENT_CONTAINER_ROOTS: &[&str] = &[
       "agents",
       ".claude/agents",
       ".codex/agents",
       ".agents/agents",
   ];
   ```

Each discovered item becomes a `DiscoveredItem { id: { kind, name }, source_path }` and is carried forward into the sync plan.

---

## 5. The sync pipeline end‑to‑end

From `AGENTS.md` / `src/sync/mod.rs`:

```
load_config → resolve_graph → build_target → create_plan → apply_plan → sync_targets → finalize
```

Each phase consumes the previous phase's struct (move semantics, no cloning):

| # | Phase | Key behavior |
|---|---|---|
| 1 | `load_config` | Acquires an advisory sync lock (`flock`/`LockFileEx`), parses `mars.toml` + `mars.local.toml`, loads previous `mars.lock`. |
| 2 | `resolve_graph` | For every dep: `list_versions` → pick SHA → fetch into `.mars/cache`. Merges model aliases from deps (consumer > deps, declaration order). |
| 3 | `build_target` | Runs discovery on each fetched tree, applies include/exclude/rename filters, rewrites YAML frontmatter refs so skill links still resolve in the new location. |
| 4 | `create_plan` | Diffs desired state vs previous lock vs disk. Emits `Add`/`Update`/`Conflict`/`Orphan` entries. Validates the whole plan before touching anything. |
| 5 | `apply_plan` | Writes items into `.mars/` canonical store via `src/reconcile/fs_ops.rs` (`atomic_write_file`, `atomic_copy_file`, `atomic_copy_dir`, all tmp+rename, perms 0o644). |
| 6 | `sync_targets` | Copies `.mars/` → each configured target (`.agents/`, `.claude/`, …). Non‑fatal per‑target: a failure on one target doesn't block others. Orphan cleanup uses *previous* lock to know what's safe to remove. |
| 7 | `finalize` | Always writes the new lock (even if target sync partially failed), persists dependency model aliases to `.mars/models-merged.json`, emits a `SyncReport`. |

Two invariants that are load‑bearing for correctness:

- **Resolve first, then act.** If any conflict/error surfaces in phases 1–4, zero filesystem mutations occur.
- **Never scan‑and‑delete unknown.** Only files whose `dest_path` was in the previous lock but is absent from the current sync result are ever deleted.

---

## 6. The bits that matter most for `bttrai`

Putting aside everything mars-specific (models catalog, plugin.json quirks, conflict resolution UI), the reusable "skills from GitHub" kernel boils down to six primitives:

1. **A declarative manifest** of dependencies (`{ url, version?, subpath?, filter? }`).
2. **Version → SHA resolution** via `git ls-remote --tags` (+ HEAD fallback).
3. **Fetch strategy**: GitHub tarball for `https://github.com/...`, `git clone` for everything else, cached by URL on disk.
4. **Discovery rules** that accept both mars‑native layouts and the conventions already used in the ecosystem (`skills/<name>/SKILL.md`, `.claude/skills/...`, `.claude-plugin/plugin.json`).
5. **A lock file** pinning each dep to a commit SHA and each installed file to a checksum + `dest_path`.
6. **Atomic install + ownership tracking** into a set of configurable target directories.

Everything else mars does — model aliases, structured diagnostics, `mars doctor`, `mars adopt`, `mars upgrade`, etc. — is built on top of those six primitives.

---

## 7. How to adopt this in `bttrai`

`bttrai` today (`src/services/install/install-utils.ts`) shells out to `npx skills@latest add <source> --skill … --agent … -y`, which means:

- We rely on a third‑party CLI being able to resolve the source.
- We have no version pinning, no lock, no drift detection.
- We can only install skills that the upstream `skills` CLI already understands.
- The registry in `src/registry/skills.ts` is a static list of `source: "owner/repo"` strings — so we already assume every skills source is a GitHub repo. That assumption is exactly what mars formalizes.

Three possible integration shapes, in increasing order of ambition:

### Option A (low risk): generate a `mars.toml` and delegate

- Add `bttrai install --engine mars` (or a new `bttrai mars init`) that emits a `mars.toml` derived from the detected registry matches, then shells out to `mars sync`.
- Implementation: map each `SkillEntry { source, skills }` to `[dependencies.<name>]` with `url = "https://github.com/<source>"` and `skills = [...]`.
- Pros: zero new fetch/discovery code; we inherit the lock file, caching, and safe ownership immediately.
- Cons: adds a Rust binary dependency, doubles the surface area for users (`bttrai` + `mars`), and still leaves MCP installs on the existing path.

### Option B (medium): TypeScript port of the mars fetch + discovery kernel

Keep `bttrai` self‑contained, but replace the `skills@latest add` shell‑out with an in‑process flow:

1. **Resolver**: shell out to `git ls-remote --tags <url>` (Node's `child_process`) or hit `https://api.github.com/repos/<owner>/<repo>/tags` when a GH token is present. Pick the newest tag matching the user's constraint, default to HEAD.
2. **Fetcher**: for `https://github.com/...`, download `https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>` and stream through `tar` (e.g. `tar`/`node-tar`) into `~/.better-ai/cache/<owner>_<repo>/<sha>/`.
3. **Discovery**: implement the fallback rules from `src/discover/mod.rs` — root `SKILL.md`, `.claude-plugin/plugin.json`, then the bounded heuristic walk over `skills/`, `.claude/skills/`, `.codex/skills/`, `.agents/skills/`.
4. **Filter**: reuse the existing `SkillEntry.skills: string[]` array as the include list (same semantics as mars's `skills = [...]`).
5. **Install**: copy each selected skill directory into the right per‑agent target (`.cursor/skills/`, `.claude/skills/`, `.codex/skills/`, etc.). Reuse the agent target map we already have in `src/registry/agents.ts`.
6. **Lock**: write a `bttrai.lock` next to `package.json` that mirrors the mars schema in spirit: `{ source, commit, items: [{ dest_path, checksum }] }`. Use it to (a) skip refetch when the SHA matches and (b) safely remove files on uninstall/re‑run without ever touching user files.

Concretely, the mapping from today's registry to a mars‑style dep is almost 1:1:

```ts
// src/registry/skills.ts (today)
{ source: "vercel-labs/agent-skills",
  skills: ["web-design-guidelines", "vercel-composition-patterns", …],
  when: { deps: ["next", "react-router-dom", …] } }

// equivalent mars.toml
[dependencies.vercel-labs_agent-skills]
url     = "https://github.com/vercel-labs/agent-skills"
skills  = ["web-design-guidelines", "vercel-composition-patterns", …]
```

So the registry already encodes a mars‑compatible dependency graph; it just needs an engine that can execute it against GitHub.

### Option C (high): full parity with mars's lock + target model

Go all the way: adopt the `mars.toml` + `mars.lock` schemas verbatim (or a close superset), treat `bttrai` as the "detect + UX" layer that authors them, and make the underlying fetch/sync pluggable between:

- an embedded TypeScript engine (Option B), and
- an external `mars` binary if the user already has it installed.

This also unlocks `bttrai upgrade` and `bttrai doctor` as thin wrappers on top of the same primitives.

---

## 8. Concrete next steps

If we want to start moving in this direction without committing to a big refactor:

1. **Stand up the resolver + fetcher in isolation.** Add `src/services/fetch/github.ts` with `resolveRef(url, versionReq)` (via `git ls-remote --tags`) and `downloadTarball(url, sha, destDir)`. No integration with install yet.
2. **Prototype discovery.** Add `src/services/fetch/discover.ts` that takes a tree path and returns `{ skillName → absolutePath }` by reimplementing `discover_fallback`. Back it with a table of fixtures under `tests/fixtures/skills-trees/`.
3. **Dry‑run mode first.** Add `bttrai install --dry-run --engine=direct` that prints the set of `{ source, sha, skills, destPaths }` it *would* install, without writing anything. Compare against today's `skills@latest add` output for a handful of real projects.
4. **Lock file.** Once dry‑run looks right, persist `bttrai.lock` and gate real installs behind "resolve → atomic write to temp → rename into place".
5. **Only then** flip the default engine, and keep `--engine=skills` (the current `npx skills@latest add`) as a fallback for anything exotic.

This sequencing mirrors the mars invariant of **"resolve first, act later"**, and gives us a clean way to validate parity with the current installer before anyone's project gets touched.

---

## 9. Pointers (file map)

Anchor links into `meridian-flow/mars-agents` for everything referenced above:

- `mars.toml` / `mars.lock` schema: [`docs/configuration.md`](https://github.com/meridian-flow/mars-agents/blob/main/docs/configuration.md), `src/config/mod.rs`, `src/lock/mod.rs`
- Version resolution + fetch strategy: `src/source/git.rs`
- Git CLI operations (`ls-remote`, clone, checkout): `src/source/git_cli.rs`
- GitHub tarball download + extraction: `src/source/archive.rs`
- URL / shorthand parsing: `src/source/parse.rs`
- Global cache layout (`~/.mars/cache`, `MARS_CACHE_DIR`): `src/source/mod.rs`
- Item discovery (conventions + fallback + plugin.json): `src/discover/mod.rs`
- Atomic writes (tmp+rename, 0o644): `src/reconcile/fs_ops.rs`
- Sync pipeline phases: `src/sync/mod.rs`, `AGENTS.md`, `CLAUDE.md`
- Target fan‑out (`.agents/`, `.claude/`, …): `src/target_sync/mod.rs`
- Structured diagnostics (no `eprintln!` in library code): `src/diagnostic.rs`
