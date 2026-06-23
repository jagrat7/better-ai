export type PrintInput = {
  source: string
  skill: string
  // Path of a single file to print, relative to the skill folder (e.g.
  // "references/common-errors.md"). Omitted → the skill's SKILL.md. An agent
  // reads SKILL.md first, then makes a separate call for a reference it needs.
  file?: string
}

export type PrintResult = {
  source: string
  skill: string
  // Path printed, relative to the skill folder ("SKILL.md" by default).
  path: string
  content: string
}

export type PrintJson = PrintResult
