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
