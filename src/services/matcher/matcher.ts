import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { McpServerEntry, SkillEntry, WhenCondition } from "../../registry/types"
import { mcpServers } from "../../registry/mcp-servers"
import { skills } from "../../registry/skills"
import type { ServiceI } from "../service.inerface"

export type ResolvedSkillEntry = Omit<SkillEntry, "conditionalSkills"> & {
  resolvedSkills: string[]
  installed: boolean
}

type SkillsLockFile = {
  version: number
  skills: Record<string, {
    source: string
    sourceType: string
    computedHash: string
  }>
}

export async function readSkillsLock(project: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(project, "skills-lock.json"), "utf-8")
    const lock: SkillsLockFile = JSON.parse(raw)
    return new Set(Object.keys(lock.skills ?? {}))
  } catch {
    return new Set()
  }
}

export type MatcherInput = {
  deps: Set<string>
}

export type MatcherResult = {
  servers: McpServerEntry[]
  skills: ResolvedSkillEntry[]
}

export type MatcherJson = {
  mcpServers: Array<{
    key: string
    label: string
    name: string
  }>
  skills: Array<{
    source: string
    label: string
    skills: string[]
  }>
}

function matches(when: WhenCondition, deps: Set<string>): boolean {
  return when.deps.includes("*") || when.deps.some((d) => deps.has(d))
}

export function matchMcpServers(deps: Set<string>): McpServerEntry[] {
  return mcpServers.filter((entry) => matches(entry.when, deps))
}

export function matchSkills(deps: Set<string>, installedSkills?: Set<string>): ResolvedSkillEntry[] {
  return skills
    .filter((entry) => matches(entry.when, deps))
    .map((entry) => {
      const extra = (entry.conditionalSkills ?? [])
        .filter((cs) => matches(cs.when, deps))
        .flatMap((cs) => cs.skills)

      const resolvedSkills = [...entry.skills, ...extra]
      const installed = installedSkills
        ? resolvedSkills.some((s) => installedSkills.has(s))
        : false

      return {
        source: entry.source,
        label: entry.label,
        skills: entry.skills,
        when: entry.when,
        resolvedSkills,
        installed,
      }
    })
}

export const matcherService = {
  run({ deps }: MatcherInput): MatcherResult {
    return {
      servers: matchMcpServers(deps),
      skills: matchSkills(deps),
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
} satisfies ServiceI<MatcherInput, MatcherResult, MatcherJson>
