import { z } from "zod"
import type { DetectInput, DetectJson, DetectResult } from "../detect/types"

// Single source of truth for install/detect flags: this zod schema drives CLI
// parsing (cli.ts) and every derived TypeScript input type below.
export const installOptions = z.object({
  project: z.string().optional().describe("Path to project directory"),
  json: z.boolean().optional().describe("Output as JSON"),
  auto: z.boolean().optional().describe("Auto-approve installation"),
  agent: z
    .array(z.string())
    .optional()
    .describe("Agents to install to (e.g. cursor, claude-code)"),
  skills: z.boolean().optional().describe("Include only skills in installation"),
  mcp: z.boolean().optional().describe("Include only MCP servers in installation"),
})

export type InstallFlags = z.infer<typeof installOptions>

// Detection drives its own project (required) + progress callbacks; the rest of
// the flags come from the shared schema.
export type InstallInput = DetectInput & Omit<InstallFlags, "project">

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

export type PackageInstallInput = InstallFlags & {
  // project is required here (the install always targets a concrete directory).
  project: string
  // Packages plus any post-`--` package-manager flags, forwarded verbatim to the
  // package manager. extractPackageNames() recovers just the package names.
  rawArgs: string[]
}

// Discriminated input for the install dispatcher: `detect` runs the project-wide
// stack detection install; `package` runs a real package install plus its extras.
export type InstallDispatchInput =
  | ({ type: "detect" } & InstallInput)
  | ({ type: "package" } & PackageInstallInput)
