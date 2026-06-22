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
   * Skill resolution, freshest-source-first:
   *   1. Dynamic discovery (when `discover`): resolve each dep live via npm +
   *      GitHub. Fresher than the hand-maintained registry, so it takes priority.
   *   2. Live-fetch the registry-pinned repos — only deps stage 1 didn't cover.
   *   3. Fall back to the hand-maintained list for repos that returned nothing.
   *
   * @param onProgress Invoked once per phase so the UI can drive spinners.
   */
  async matchSkills(
    deps: Set<string>,
    installedSkills?: Set<string>,
    onProgress?: MatcherInput["onProgress"],
    discover?: boolean,
  ): Promise<ResolvedSkillEntry[]> {
    const matchedEntries = skills.filter((entry) => matcherUtils.matches(entry.when, deps))

    // ── Stage 1: dynamic discovery (package-install only) ──────────────────
    // Resolve each dep live, in parallel, off npm registry metadata
    // (registry.npmjs.org/<pkg> → repository.url) plus GitHub search; fresh
    // sources win over the static registry. `seenSources` dedups repos (two deps
    // → same repo collapse to one entry); `coveredDeps` records resolved deps.
    const dynamicEntries: ResolvedSkillEntry[] = []
    const seenSources = new Set<string>()
    const coveredDeps = new Set<string>()
    if (discover) {
      const hits = await Promise.all(
        // Three tiers per dep, first repo with a SKILL.md wins (example: dep `hono`).
        [...deps].map(async (dep) => {
          const npmRepo = await matcherUtils.resolveNpmRepo(dep)
          if (npmRepo) {
            // 1a. npm `repository` field → the dep's own repo (hono → honojs/hono).
            const skills = await matcherUtils.discoverRepoSkills(npmRepo)
            if (skills.length > 0) return { source: npmRepo, dep, skills }
            // 1b. npm owner + `*skill*` repo → a sibling repo under that owner (user:honojs skill).
            const owner = npmRepo.split("/")[0]
            const ownerHit = await matcherUtils.resolveFromSearch(`user:${owner} skill in:name`, dep)
            if (ownerHit) return ownerHit
          }
          // 1c. global `<pkg> skill` search → an unrelated owner (hono → yusukebe/hono-skill).
          const term = dep.split("/").at(-1) ?? dep
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

    // ── Stage 2: live-fetch the registry-pinned repos ─────────────────────
    // Each registry entry pins a `source` repo + a hand-maintained `skills` list.
    // First drop entries dynamic already covered: same source, or every
    // triggering dep already resolved live. The registry only tells us WHICH
    // repo to look at — we still tree-scan it live for the CURRENT skills
    // (fresher than the hand-maintained `skills` list). `configuredSkills` is
    // computed now as the stage-3 fallback.
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

    // ── Stage 3: fall back to the hand-maintained list ─────────────────────
    // Repos the live scan returned nothing for (404 / rate-limited / no
    // SKILL.md) use the registry-declared `skills` instead. Count them first
    // so the spinner can show how many entries are on the fallback path.
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

    // Fresh dynamic first, possibly-stale registry last.
    return [...dynamicEntries, ...registryEntries]
  },
  /**
   * Public entry point: run MCP + skill matching together. MCP matching is synchronous
   * (registry-only) while skill matching is async (involves GitHub fetches).
   */
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
