export type McpTransport = "http" | "sse"

export type WhenCondition = {
  deps: string[] // OR logic — any dep match triggers the entry
}

export type McpServerEntry = {
  key: string
  label: string
  name: string
  target: string
  transport?: McpTransport
  headers?: string[]
  when: WhenCondition
}

export type AgentOption = {
  value: string
  label: string
  globalOnly?: boolean
}

// One canonical agent exposed to users (in config + `--agent`), translated
// internally to the underlying MCP and/or skill CLI targets. An agent may omit
// a side (e.g. vscode has no skill target).
export type AgentTarget = {
  id: string
  label: string
  mcp?: string
  skills?: string
  globalOnly?: boolean
}

export type SkillEntry = {
  source: string
  label: string
  skills: string[]
  conditionalSkills?: {
    when: WhenCondition
    skills: string[]
  }[]
  when: WhenCondition
}
