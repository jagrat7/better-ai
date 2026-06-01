export type SkillDetectionSource = "github" | "fallback"

export type McpServerJson = {
  key: string
  label: string
  name: string
}

export type SkillJson = {
  source: string
  label: string
  detectionSource: SkillDetectionSource
  skills: string[]
  skillPaths: string[]
}
