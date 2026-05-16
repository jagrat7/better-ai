import type { McpServerEntry, SkillEntry } from "../../registry/types"
import type { McpServerJson, SkillJson } from "../shared/types"

export type ResolvedSkillEntry = Omit<SkillEntry, "conditionalSkills"> & {
  resolvedSkills: string[]
  resolvedSkillPaths: string[]
  installed: boolean
}

export type SkillsLockFile = {
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
  onProgress?: (progress: MatcherProgress) => void
}

export type MatcherProgress = {
  phase: "github" | "fallback"
  total: number
}

export type MatcherResult = {
  servers: McpServerEntry[]
  skills: ResolvedSkillEntry[]
}

export type MatcherJson = {
  mcpServers: McpServerJson[]
  skills: SkillJson[]
}
