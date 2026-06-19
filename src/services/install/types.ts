import type { DetectInput, DetectJson, DetectResult } from "../detect/types"

export type InstallInput = DetectInput & {
  auto?: boolean
  json?: boolean
  agent?: string[]
  skills?: boolean
  mcp?: boolean
}

export type InstallResult = DetectResult & {
  selectedServers: DetectResult["servers"]
  selectedSkills: DetectResult["matched"]
  selectedMcpAgents: string[]
  selectedSkillAgents: string[]
  scope?: "all" | "skills" | "mcp"
}

export type InstallJson = DetectJson & {
  selectedMcpServers: DetectJson["mcpServers"]
  selectedSkills: DetectJson["skills"]
}

export type PackageInstallInput = {
  project: string
  // Packages plus any post-`--` package-manager flags, forwarded verbatim to the
  // package manager. extractPackageNames() recovers just the package names.
  rawArgs: string[]
  mcp?: boolean
  skills?: boolean
  agent?: string[]
  auto?: boolean
  json?: boolean
}

// Discriminated input for the install dispatcher: `detect` runs the project-wide
// stack detection install; `package` runs a real package install plus its extras.
export type InstallDispatchInput =
  | ({ type: "detect" } & InstallInput)
  | ({ type: "package" } & PackageInstallInput)
