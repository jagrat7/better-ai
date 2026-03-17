import type { McpServerEntry, SkillEntry, WhenCondition } from "./registry/types"
import { mcpServers } from "./registry/mcp-servers"
import { skills } from "./registry/skills"

export type ResolvedSkillEntry = Omit<SkillEntry, "conditionalSkills"> & {
  resolvedSkills: string[]
}

function matches(when: WhenCondition, deps: Set<string>): boolean {
  return when.deps.includes("*") || when.deps.some((d) => deps.has(d))
}

export function matchMcpServers(deps: Set<string>): McpServerEntry[] {
  return mcpServers.filter((entry) => matches(entry.when, deps))
}

export function matchSkills(deps: Set<string>): ResolvedSkillEntry[] {
  return skills
    .filter((entry) => matches(entry.when, deps))
    .map((entry) => {
      const extra = (entry.conditionalSkills ?? [])
        .filter((cs) => matches(cs.when, deps))
        .flatMap((cs) => cs.skills)

      return {
        source: entry.source,
        label: entry.label,
        skills: entry.skills,
        when: entry.when,
        resolvedSkills: [...entry.skills, ...extra],
      }
    })
}
