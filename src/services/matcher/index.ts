import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { mcpServers } from "../../registry/mcp-servers"
import { skills } from "../../registry/skills"
import { matches } from "./utils"
import type {
  MatcherInput,
  MatcherJson,
  MatcherResult,
  ResolvedSkillEntry,
  SkillsLockFile,
} from "./types"

// Repos named exactly "skills" (e.g. `better-auth/skills`) hold all their SKILL.md
// files at the top level instead of under a `skills/` subdirectory. We detect this
// to relax the path filter for those repos.
const githubSkillsRepoName = "skills"
// Optional token lifts both rate-limit buckets: core REST 60→5,000/hr (git/trees)
// and Search 10→30/min. Falls back to unauthenticated when neither var is set.
const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "better-ai",
  ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
}

export const matcherService = {
  // Reads the project's skills-lock.json to know which skills are already installed.
  async readSkillsLock(project: string): Promise<Set<string>> {
    try {
      const raw = await readFile(join(project, "skills-lock.json"), "utf-8")
      const lock: SkillsLockFile = JSON.parse(raw)
      return new Set(Object.keys(lock.skills ?? {}))
    } catch {
      return new Set()
    }
  },
  // Discovers every folder containing a SKILL.md in a GitHub repo via one
  // recursive git-tree API call (single request regardless of repo size).
  // Returns directory paths (relative to repo root) — not slugs.
  async getRepoSkillPaths(repo: string): Promise<string[]> {
    // Repos literally named "skills" get a relaxed filter (any SKILL.md counts).
    const isSkillsRepo = repo.split("/").at(-1) === githubSkillsRepoName

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`,
        { headers: githubHeaders },
      )
      // Network errors, 404s, rate limits, etc. → caller falls back to registry.
      if (!response.ok) return []

      const { tree = [] } = (await response.json()) as {
        tree?: Array<{ path?: string; type?: string }>
      }

      return [
        ...new Set(
          tree.flatMap((item) => {
            // Only consider files literally named SKILL.md.
            if (item.type !== "blob" || !item.path?.endsWith("/SKILL.md")) return []
            // Strip the trailing "/SKILL.md" to get the skill's folder path.
            const skillPath = item.path.slice(0, item.path.lastIndexOf("/"))
            // Require a `skills/` segment somewhere in the path — prevents picking
            // up SKILL.md files from unrelated nested directories. The skills-named
            // repo escape hatch above bypasses this.
            const inSkillsDir = skillPath.split("/").includes(githubSkillsRepoName)
            return inSkillsDir || isSkillsRepo ? [skillPath] : []
          }),
        ),
      ].sort()
    } catch {
      return []
    }
  },
  // TODO: This three still seem like slop, FIX!
  // For each skill folder found by getRepoSkillPaths, fetch its SKILL.md and
  // parse the YAML frontmatter `name:` field. That slug is what `skills@latest`
  // expects as the --skill argument (it may differ from the folder name, e.g.
  // folder `use-ai-sdk` declares `name: ai-sdk`).
  async discoverRepoSkills(repo: string): Promise<Array<{ name: string; path: string }>> {
    const skillPaths = await matcherService.getRepoSkillPaths(repo)

    const results = await Promise.all(
      skillPaths.map(async (skillPath) => {
        // Fallback used when fetch/parse fails — last path segment is usually
        // close enough to the slug.
        const folderName = skillPath.slice(skillPath.lastIndexOf("/") + 1)
        try {
          // raw.githubusercontent.com is a CDN with no auth rate limits, unlike
          // api.github.com. Safe to call once per discovered skill.
          const response = await fetch(
            `https://raw.githubusercontent.com/${repo}/HEAD/${skillPath}/SKILL.md`,
          )
          if (!response.ok) return { name: folderName, path: skillPath }
          const text = await response.text()
          // Extract YAML frontmatter block between leading `---` fences.
          const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? ""
          // Capture `name: value` supporting double-quoted, single-quoted, and bare values.
          const nameMatch = frontmatter.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|(.+?))\s*$/m)
          const slug = (nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3])?.trim()
          return { name: slug ?? folderName, path: skillPath }
        } catch {
          return { name: folderName, path: skillPath }
        }
      }),
    )

    // Deduplicate by skill name — repos like stripe/ai mirror the same SKILL.md
    // under multiple skills/ subdirectories. Paths are sorted alphabetically, so
    // we keep the first occurrence (path only drives display; --skill uses name).
    const seen = new Set<string>()
    return results.filter((r) => {
      if (seen.has(r.name)) return false
      seen.add(r.name)
      return true
    })
  },
  // Resolve an npm package to its GitHub "owner/repo" via the registry's
  // repository.url field. Used as the first dynamic-discovery signal — works
  // when a package keeps its skills inside its own source repo (e.g. vercel/ai).
  // Returns null for missing metadata or non-GitHub repos.
  async resolveNpmRepo(pkg: string): Promise<string | null> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${pkg}`)
      if (!response.ok) return null
      const data = (await response.json()) as { repository?: string | { url?: string } }
      const url = typeof data.repository === "string" ? data.repository : data.repository?.url
      if (!url) return null
      // Handle git+https://github.com/owner/repo.git, git://…, and git@github.com:owner/repo.
      const match = url.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?]|$)/)
      return match ? `${match[1]}/${match[2]}` : null
    } catch {
      return null
    }
  },
  // Run a GitHub repo search, tree-scan each hit, and return the first repo that
  // actually holds a SKILL.md. Shared by the owner-scoped and global search tiers.
  async resolveFromSearch(
    query: string,
    dep: string,
  ): Promise<{ source: string; dep: string; skills: Array<{ name: string; path: string }> } | null> {
    try {
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`,
        { headers: githubHeaders },
      )
      if (!response.ok) return null
      const { items = [] } = (await response.json()) as { items?: Array<{ full_name?: string }> }
      for (const item of items) {
        if (!item.full_name) continue
        const skills = await matcherService.discoverRepoSkills(item.full_name)
        if (skills.length > 0) return { source: item.full_name, dep, skills }
      }
      return null
    } catch {
      return null
    }
  },
  // Live resolution for a dep the static registry didn't match, in precision order:
  //   1. npm repository field — skills in the package's own repo (vercel/ai).
  //   2. npm owner + `*skill*` repo name — separate skills repo under the SAME
  //      owner npm reported (@neondatabase/serverless → neondatabase/agent-skills).
  //   3. global `<pkg> skill` search — skills repo under an unrelated owner
  //      (hono → yusukebe/hono-skill).
  // Stops at the first repo that actually holds a SKILL.md.
  async resolveDynamicSource(
    dep: string,
  ): Promise<{ source: string; dep: string; skills: Array<{ name: string; path: string }> } | null> {
    const npmRepo = await matcherService.resolveNpmRepo(dep)
    if (npmRepo) {
      const skills = await matcherService.discoverRepoSkills(npmRepo)
      if (skills.length > 0) return { source: npmRepo, dep, skills }
      const owner = npmRepo.split("/")[0]
      const ownerHit = await matcherService.resolveFromSearch(`user:${owner} skill in:name`, dep)
      if (ownerHit) return ownerHit
    }
    const term = dep.split("/").at(-1) ?? dep
    return matcherService.resolveFromSearch(`${term} skill`, dep)
  },
  // Filter the static MCP server registry down to entries whose `when` condition
  // is satisfied by the project's deps.
  matchMcpServers(deps: Set<string>): MatcherResult["servers"] {
    return mcpServers.filter((entry) => matches(entry.when, deps))
  },
  // Two-phase skill resolution:
  //   1. GitHub phase: for every matched registry entry, fetch its actual skills
  //      from GitHub in parallel.
  //   2. Fallback phase: any source that returned no GitHub skills falls back
  //      to the registry-declared skill list.
  // onProgress is invoked once per phase so the UI can drive spinners.
  async matchSkills(
    deps: Set<string>,
    installedSkills?: Set<string>,
    onProgress?: MatcherInput["onProgress"],
    discover?: boolean,
  ): Promise<ResolvedSkillEntry[]> {
    // Filter registry entries whose `when` predicate matches the project's deps.
    const matchedEntries = skills.filter((entry) => matches(entry.when, deps))

    // Signal the start of GitHub fetching with total work to do.
    onProgress?.({ phase: "github", total: matchedEntries.length })

    // Resolve every matched source in parallel — each does one tree fetch +
    // N raw fetches (one per discovered SKILL.md) inside discoverRepoSkills.
    const githubResults = await Promise.all(
      matchedEntries.map(async (entry) => {
        // Merge base skills with any conditional skills whose `when` also matches.
        const extra = (entry.conditionalSkills ?? [])
          .filter((cs) => matches(cs.when, deps))
          .flatMap((cs) => cs.skills)
        const configuredSkills = [...entry.skills, ...extra]
        // Mark this source as installed if ANY of its configured skills are in the lockfile.
        const installed = installedSkills
          ? configuredSkills.some((s) => installedSkills.has(s))
          : false
        const fetchedSkills = await matcherService.discoverRepoSkills(entry.source)

        return {
          entry,
          configuredSkills,
          fetchedSkills,
          installed,
        }
      }),
    )

    // Count how many sources need fallback (GitHub returned nothing for them).
    const fallbackResults = githubResults.filter((result) => result.fetchedSkills.length === 0)
    onProgress?.({ phase: "fallback", total: fallbackResults.length })

    // Build the final per-source result: prefer GitHub-discovered skills when
    // available, otherwise use the registry-declared list.
    const staticResults: ResolvedSkillEntry[] = githubResults.map(
      ({ entry, configuredSkills, fetchedSkills, installed }) => {
        const detectionSource = fetchedSkills.length > 0 ? "github" : "fallback"
        const resolvedSkills =
          detectionSource === "github" ? fetchedSkills.map((skill) => skill.name) : configuredSkills
        const resolvedSkillPaths =
          detectionSource === "github" ? fetchedSkills.map((skill) => skill.path) : configuredSkills

        return {
          source: entry.source,
          label: entry.label,
          skills: entry.skills,
          when: entry.when,
          resolvedSkills,
          resolvedSkillPaths,
          detectionSource,
          installed,
        }
      },
    )

    // Opt-in dynamic discovery for deps the static registry didn't cover. Gated
    // by `discover` (package-install only) — see MatcherInput.
    if (!discover) return staticResults

    const coveredDeps = new Set(matchedEntries.flatMap((entry) => entry.when.deps))
    const unmatchedDeps = [...deps].filter((dep) => !coveredDeps.has(dep))
    const dynamicResolved = await Promise.all(
      unmatchedDeps.map((dep) => matcherService.resolveDynamicSource(dep)),
    )

    // Dedup against static sources and across deps that resolve to the same repo.
    const seenSources = new Set(staticResults.map((result) => result.source))
    const dynamicResults: ResolvedSkillEntry[] = []
    for (const resolved of dynamicResolved) {
      if (!resolved || seenSources.has(resolved.source)) continue
      seenSources.add(resolved.source)
      const names = resolved.skills.map((skill) => skill.name)
      dynamicResults.push({
        source: resolved.source,
        label: resolved.dep,
        skills: names,
        when: { deps: [resolved.dep] },
        resolvedSkills: names,
        resolvedSkillPaths: resolved.skills.map((skill) => skill.path),
        detectionSource: "github",
        installed: names.some((name) => installedSkills?.has(name) ?? false),
      })
    }

    return [...staticResults, ...dynamicResults]
  },
  // Public entry point: run MCP + skill matching together. MCP matching is synchronous
  // (registry-only) while skill matching is async (involves GitHub fetches).
  async run({ deps, installedSkills, onProgress, discover }: MatcherInput): Promise<MatcherResult> {
    return {
      servers: matcherService.matchMcpServers(deps),
      skills: await matcherService.matchSkills(deps, installedSkills, onProgress, discover),
    }
  },
  json(result: MatcherResult): MatcherJson {
    return {
      mcpServers: result.servers.map((server) => ({
        key: server.key,
        label: server.label,
        name: server.name,
      })),
      skills: result.skills.map((skill) => ({
        source: skill.source,
        label: skill.label,
        detectionSource: skill.detectionSource,
        skills: skill.resolvedSkills,
        skillPaths: skill.resolvedSkillPaths,
      })),
    }
  },
  command(result: MatcherResult): void {
    console.log(JSON.stringify(matcherService.json(result), null, 2))
  },
}
