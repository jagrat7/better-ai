import { mcpServers } from "../../registry/mcp-servers"
import { skills } from "../../registry/skills"
import * as matcherUtils from "./utils"
import type { MatcherInput, MatcherJson, MatcherResult, ResolvedSkillEntry } from "./types"

export const matcherService = {
  /**
   * Filter the static MCP server registry down to entries whose `when` condition
   * is satisfied by the project's deps.
   */
  matchMcpServers(deps: Set<string>): MatcherResult["servers"] {
    return mcpServers.filter((entry) => matcherUtils.matches(entry.when, deps))
  },
  /**
   * Skill resolution, freshest-source-first. Stages 0–2 fetch the real SKILL.md
   * set; they differ in source and cost:
   *   0. Local node_modules scan — skills shipped inside the installed package's
   *      tarball (TanStack Intent convention). No network, version-pinned. Runs
   *      whenever the project root is known (detect AND package-install).
   *   1. Discover the repo live (npm metadata or GitHub search), then fetch its
   *      skills. Package-install only; freshest network source, so it's next.
   *   2. Repo identity comes from the static registry; fetch its current skills
   *      from GitHub. Only deps stages 0/1 didn't already cover.
   *   3. Fallback (no GitHub): repos the stage-2 fetch returned nothing for use
   *      the registry's hand-maintained skill list instead.
   *
   * @param onProgress Invoked once per phase so the UI can drive spinners.
   */
  async matchSkills(
    deps: Set<string>,
    installedSkills?: Set<string>,
    onProgress?: MatcherInput["onProgress"],
    discover?: boolean,
    project?: string,
  ): Promise<ResolvedSkillEntry[]> {
    const matchedEntries = skills.filter((entry) => matcherUtils.matches(entry.when, deps))

    // `seenSources` dedups repos (two deps → same repo collapse to one entry);
    // `coveredDeps` records resolved deps so later stages skip them.
    const seenSources = new Set<string>()
    const coveredDeps = new Set<string>()

    // ── Stage 0: local node_modules scan (TanStack Intent-compatible) ──────
    // Skills shipped inside an installed package's tarball land in
    // node_modules/<dep>/skills/**/SKILL.md. Reading them is a local fs walk —
    // no network, no rate limit, pinned to the installed version — so it runs
    // for every flow that knows the project root, ahead of the GitHub stages.
    const localEntries: ResolvedSkillEntry[] = []
    if (project) {
      onProgress?.({ phase: "local", total: deps.size })
      const localHits = await Promise.all(
        [...deps].map(async (dep) => {
          const found = await matcherUtils.discoverLocalSkills(project, dep)
          return found.length > 0 ? { dep, skills: found } : null
        }),
      )
      for (const hit of localHits) {
        if (!hit) continue
        seenSources.add(hit.dep)
        coveredDeps.add(hit.dep)
        const names = hit.skills.map((skill) => skill.name)
        localEntries.push({
          source: hit.dep,
          label: hit.dep,
          skills: names,
          when: { deps: [hit.dep] },
          resolvedSkills: names,
          resolvedSkillPaths: hit.skills.map((skill) => skill.path),
          detectionSource: "local",
          installed: names.some((name) => installedSkills?.has(name) ?? false),
        })
      }
    }

    // ── Stage 1: discover the repo live, then fetch its skills ─────────────
    // Package-install only. For each dep stage 0 didn't already resolve, in
    // parallel, find the repo (npm registry.npmjs.org/<pkg> → repository.url,
    // else GitHub search) and tree-scan it for SKILL.md files — same GitHub
    // fetch stage 2 does, but the repo is discovered rather than registry-
    // pinned. Fresh sources win over the static registry.
    const dynamicEntries: ResolvedSkillEntry[] = []
    if (discover) {
      onProgress?.({ phase: "discover", total: deps.size })
      // Emit an atomic step, then pause briefly so the message is readable —
      // tiers resolve fast (often cached) and would otherwise flash past. The
      // delay only runs when a listener is attached, keeping tests instant.
      const report = async (message: string) => {
        if (!onProgress) return
        onProgress({ phase: "discover-step", message })
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      const hits = await Promise.all(
        // Three tiers per dep, first repo with a SKILL.md wins (example: dep `hono`).
        // Each tier streams an atomic step so the spinner names the exact action
        // in flight (npm lookup → GitHub repo scan → GitHub search). Deps stage 0
        // already resolved locally are skipped.
        [...deps].filter((dep) => !coveredDeps.has(dep)).map(async (dep) => {
          // 1a. npm `repository` field → the dep's own repo (hono → honojs/hono).
          await report(matcherUtils.skillSearchMessage.npmLookup(dep))
          const npmRepo = await matcherUtils.resolveNpmRepo(dep)
          if (npmRepo) {
            await report(matcherUtils.skillSearchMessage.repoScan(npmRepo))
            const skills = await matcherUtils.discoverRepoSkills(npmRepo)
            if (skills.length > 0) return { source: npmRepo, dep, skills }
            // 1b. npm owner + `*skill*` repo → a sibling repo under that owner (user:honojs skill).
            const owner = npmRepo.split("/")[0] ?? npmRepo
            await report(matcherUtils.skillSearchMessage.ownerSearch(owner, dep))
            const ownerHit = await matcherUtils.resolveFromSearch(`user:${owner} skill in:name`, dep)
            if (ownerHit) return ownerHit
          }
          // 1c. global `<pkg> skill` search → an unrelated owner (hono → yusukebe/hono-skill).
          const term = dep.split("/").at(-1) ?? dep
          await report(matcherUtils.skillSearchMessage.globalSearch(term))
          return matcherUtils.resolveFromSearch(`${term} skill`, dep)
        }),
      )
      for (const hit of hits) {
        // Skip deps that didn't resolve, and repos another dep already produced.
        if (!hit || seenSources.has(hit.source)) continue
        seenSources.add(hit.source)
        coveredDeps.add(hit.dep)
        const names = hit.skills.map((skill) => skill.name)
        dynamicEntries.push({
          source: hit.source,
          label: hit.dep,
          skills: names,
          when: { deps: [hit.dep] },
          resolvedSkills: names,
          resolvedSkillPaths: hit.skills.map((skill) => skill.path),
          detectionSource: "github",
          installed: names.some((name) => installedSkills?.has(name) ?? false),
        })
      }
    }

    // ── Stage 2: fetch the registry-pinned repos from GitHub ───────────────
    // Same GitHub tree-scan as stage 1; the only difference is the repo identity
    // comes from the registry instead of live discovery. Each entry pins a
    // `source` repo + a hand-maintained `skills` list. First drop entries
    // dynamic already covered: same source, or every triggering dep already
    // resolved live. We still tree-scan the pinned repo for its CURRENT skills
    // (fresher than the hand-maintained list); `configuredSkills` is computed now
    // as the stage-3 fallback.
    const gapEntries = matchedEntries.filter(
      (entry) =>
        !seenSources.has(entry.source) &&
        entry.when.deps.filter((dep) => deps.has(dep)).some((dep) => !coveredDeps.has(dep)),
    )

    onProgress?.({ phase: "github", total: gapEntries.length })
    const fetched = await Promise.all(
      gapEntries.map(async (entry) => {
        const extra = (entry.conditionalSkills ?? [])
          .filter((cs) => matcherUtils.matches(cs.when, deps))
          .flatMap((cs) => cs.skills)
        const configuredSkills = [...entry.skills, ...extra]
        const githubSkills = await matcherUtils.discoverRepoSkills(entry.source)
        return { entry, configuredSkills, githubSkills }
      }),
    )

    // ── Stage 3: fallback — no GitHub, use the hand-maintained list ────────
    // The stage-2 fetch returned nothing for these repos (404 / rate-limited /
    // no SKILL.md), so use the registry-declared `skills` instead. Count them
    // first so the spinner can show how many entries are on the fallback path.
    const fallbackCount = fetched.filter(({ githubSkills }) => githubSkills.length === 0).length
    onProgress?.({ phase: "fallback", total: fallbackCount })

    const registryEntries: ResolvedSkillEntry[] = fetched.map(
      ({ entry, configuredSkills, githubSkills }) => {
        // Live scan wins; empty scan → fall back to the pinned `skills` list.
        const fromGithub = githubSkills.length > 0
        return {
          source: entry.source,
          label: entry.label,
          skills: entry.skills,
          when: entry.when,
          resolvedSkills: fromGithub ? githubSkills.map((skill) => skill.name) : configuredSkills,
          resolvedSkillPaths: fromGithub ? githubSkills.map((skill) => skill.path) : configuredSkills,
          detectionSource: fromGithub ? "github" : "fallback",
          installed: configuredSkills.some((skill) => installedSkills?.has(skill) ?? false),
        }
      },
    )

    // Local (free, version-pinned) first, fresh dynamic next, possibly-stale
    // registry last.
    return [...localEntries, ...dynamicEntries, ...registryEntries]
  },
  /**
   * Public entry point: run MCP + skill matching together. MCP matching is synchronous
   * (registry-only) while skill matching is async (involves GitHub fetches).
   */
  async run({
    deps,
    installedSkills,
    onProgress,
    discover,
    project,
  }: MatcherInput): Promise<MatcherResult> {
    return {
      servers: matcherService.matchMcpServers(deps),
      skills: await matcherService.matchSkills(deps, installedSkills, onProgress, discover, project),
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
