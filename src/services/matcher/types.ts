import type { McpServerEntry, SkillEntry } from "../../registry/types"
import type { McpServerJson, SkillDetectionSource, SkillJson } from "../shared/types"

export type ResolvedSkillEntry = Omit<SkillEntry, "conditionalSkills"> & {
  resolvedSkills: string[]
  resolvedSkillPaths: string[]
  detectionSource: SkillDetectionSource
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
  // Opt-in live discovery: deps unmatched by the static registry get resolved
  // via npm repo metadata → GitHub repo search. Only the package-targeted
  // install sets this — the detect flow scans every project dep, far too many
  // to probe without tripping GitHub's unauthenticated rate limit.
  discover?: boolean
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
