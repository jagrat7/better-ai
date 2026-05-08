import type { MatcherResult } from "../matcher/types"
import type { McpServerJson, SkillJson } from "../shared"

export type DetectInput = {
  project: string
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
