import type { MatcherProgress, MatcherResult } from "../matcher/types"
import type { McpServerJson, SkillJson } from "../shared/types"

export type DetectInput = {
  project: string
  onDeps?: (deps: Set<string>) => void
  onProgress?: (progress: MatcherProgress) => void
}

export type DetectCommandInput = DetectInput & {
  json?: boolean
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
