import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { McpServerEntry, SkillEntry } from "../../registry/types"
import { mcpServers } from "../../registry/mcp-servers"
import { skills } from "../../registry/skills"
import type { McpServerJson, SkillJson } from "../shared"
import { matches } from "./utils"

export type ResolvedSkillEntry = Omit<SkillEntry, "conditionalSkills"> & {
  resolvedSkills: string[]
  installed: boolean
}

type SkillsLockFile = {
  version: number
  skills: Record<
    string,
    {
      source: string
      sourceType: string
      computedHash: string
    }
  >
}

export type MatcherInput = {
  deps: Set<string>
  installedSkills?: Set<string>
}

export type MatcherResult = {
  servers: McpServerEntry[]
  skills: ResolvedSkillEntry[]
}

export type MatcherJson = {
  mcpServers: McpServerJson[]
  skills: SkillJson[]
}

export const matcherService = {
  async readSkillsLock(project: string): Promise<Set<string>> {
    try {
      const raw = await readFile(join(project, "skills-lock.json"), "utf-8")
      const lock: SkillsLockFile = JSON.parse(raw)
      return new Set(Object.keys(lock.skills ?? {}))
    } catch {
      return new Set()
    }
  },
  matchMcpServers(deps: Set<string>): McpServerEntry[] {
    return mcpServers.filter((entry) => matches(entry.when, deps))
  },
  matchSkills(deps: Set<string>, installedSkills?: Set<string>): ResolvedSkillEntry[] {
    return skills
      .filter((entry) => matches(entry.when, deps))
      .map((entry) => {
        const extra = (entry.conditionalSkills ?? [])
          .filter((cs) => matches(cs.when, deps))
          .flatMap((cs) => cs.skills)

        const resolvedSkills = [...entry.skills, ...extra]
        const installed = installedSkills ? resolvedSkills.some((s) => installedSkills.has(s)) : false

        return {
          source: entry.source,
          label: entry.label,
          skills: entry.skills,
          when: entry.when,
          resolvedSkills,
          installed,
        }
      })
  },
  run({ deps, installedSkills }: MatcherInput): MatcherResult {
    return {
      servers: matcherService.matchMcpServers(deps),
      skills: matcherService.matchSkills(deps, installedSkills),
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
        skills: skill.resolvedSkills,
      })),
    }
  },
  command(result: MatcherResult): void {
    console.log(JSON.stringify(matcherService.json(result), null, 2))
  },
}
