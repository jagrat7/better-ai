---
name: bttrai
description: How to use bttrai to detect, print, and install AI skills and MCP servers for your project. Yout AI dependencies manger
---

# bttrai — AI dependency manager

bttrai is a CLI that finds the MCP servers and AI skills matching your project's dependencies and installs them scoped to your project. It keeps an agent's context window lean by loading only what's relevant. Three ways to use it:

- **`install`** — add a package and pull in its matching MCP servers + skills (most exhaustive)
- **`detect`** — scan a project for matches (WIP; best targeted at a single dependency)
- **`print`** — dump a skill's `SKILL.md` (or a reference file) to stdout for an agent to read
- **`config`** — open the config file to pin agents and define presets

For the full, current flags of any command, run `npx bttrai <command> --help` rather than relying on this doc. The sections below cover the essentials.

## `install` — add a package and its matching extras

The primary path. Installs the package and any MCP servers + skills the registry maps to it.

```bash
npx bttrai install ai                # package + matching MCP servers + skills
npx bttrai install ai zod --skills   # multiple packages, skills only
npx bttrai install ai -- -D          # forward native pm flags after `--`
```

## `detect` — scan a project for matches

Detects dependencies already in the project and installs matching extras. **This is WIP** — full-stack detection only catches direct registry matches and is less exhaustive than `install`. Prefer targeting a **single dependency**, which is reliable:

```bash
npx bttrai detect zod        # recommended: matches for one dependency
npx bttrai detect --dep zod  # same, explicit flag
npx bttrai detect            # full-stack scan (WIP — may miss matches)
npx bttrai detect ai --print    # print matches without installing
```

## `print` — fetch a skill file from its source repo

Print a skill straight to stdout so an agent can read it into context without installing anything.

```bash
npx bttrai print <source> <skill> [file]
```

- `<source>` — the skill's source repo as `owner/repo` (e.g. `vercel/ai`)
- `<skill>` — the skill name from its frontmatter (e.g. `ai-sdk`; the folder may differ)
- `[file]` — optional file within the skill folder; defaults to `SKILL.md`

```bash
npx bttrai print vercel/ai ai-sdk                              # the skill's SKILL.md
npx bttrai print vercel/ai ai-sdk references/common-errors.md  # a reference file
```

Output is plain stdout with a provenance header (`# skill: ai-sdk · vercel/ai — SKILL.md`) so it survives a copy-paste into chat. Alias: `npx bttrai prs`.

### Agent workflow: pull matched skills into context

Chain `detect --print` with `print` to load relevant skills without installing. `detect --print` emits one runnable `print` command per matched skill:

```bash
$ npx bttrai detect ai --print
npx bttrai print vercel/ai ai-sdk
npx bttrai print colinhacks/zod zod
```

Run each emitted command to load that skill's `SKILL.md` into context. References are not pulled automatically — if you need to investigate a reference the `SKILL.md` points to, run `print` again with that file's path yourself (e.g. `npx bttrai print vercel/ai ai-sdk references/common-errors.md`). Only fetch a reference when you actually need it, so the default output stays lean.

## `config` — pin agents and define presets

```bash
npx bttrai config  # open the config file (creates it if missing)
```

Use it to pin which agents skills install into (so `--agent` isn't needed each run) and to define presets. Run `npx bttrai config --help` for details.

## Flags

Common flags shared across commands: `--auto` (skip prompts), `--agent <name>` (target agents), `--skills` / `--mcp` (scope), `--json` (machine-readable). For the authoritative, per-command list run `npx bttrai <command> --help`.
