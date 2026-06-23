import type { MatcherProgress, MatcherResult } from "../matcher/types"
import type { McpServerJson, SkillJson } from "../shared/types"

export type DetectInput = {
  project: string
  // When set, restrict detection to this single project dependency and opt into
  // live discovery (npm + GitHub) — affordable for one dep, unlike a full scan.
  dep?: string
  onDeps?: (deps: Set<string>) => void
  onProgress?: (progress: MatcherProgress) => void
}

export type DetectResult = {
  project: string
  deps: Set<string>
  servers: MatcherResult["servers"]
  matched: MatcherResult["skills"]
}

export type DetectJson = {
  deps: string[]
  mcpServers: McpServerJson[]
  skills: SkillJson[]
}
