import { access } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"
import type { McpServerEntry } from "../../registry/types"
import type { ResolvedSkillEntry } from "../matcher/matcher"

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm"

export type InstallFailure<T> = {
  item: T
  error: string
}

export type InstallExecutionSummary = {
  packageManager: PackageManager
  skills: {
    installed: ResolvedSkillEntry[]
    failed: Array<InstallFailure<ResolvedSkillEntry>>
  }
  mcp: {
    installed: McpServerEntry[]
    failed: Array<InstallFailure<McpServerEntry>>
  }
}

export type AgentOption = {
  value: string
  label: string
}

export const MCP_AGENTS: AgentOption[] = [
  { value: "cursor", label: "Cursor" },
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "github-copilot-cli", label: "GitHub Copilot CLI" },
  { value: "mcporter", label: "MCPorter" },
  { value: "vscode", label: "VS Code (GitHub Copilot)" },
  { value: "zed", label: "Zed" },
]

export const SKILL_AGENTS: AgentOption[] = [
  { value: "cursor", label: "Cursor" },
  { value: "claude-code", label: "Claude Code" },
  { value: "cline", label: "Cline" },
  { value: "github-copilot", label: "GitHub Copilot" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "windsurf", label: "Windsurf" },
  { value: "goose", label: "Goose" },
  { value: "roo", label: "Roo Code" },
  { value: "kilo", label: "Kilo Code" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "antigravity", label: "Antigravity" },
  { value: "openhands", label: "OpenHands" },
  { value: "trae", label: "Trae" },
  { value: "amp", label: "Amp" },
  { value: "pi", label: "Pi" },
  { value: "qoder", label: "Qoder" },
  { value: "qwen-code", label: "Qwen Code" },
  { value: "kiro-cli", label: "Kiro CLI" },
  { value: "droid", label: "Droid" },
  { value: "command-code", label: "Command Code" },
  { value: "clawdbot", label: "Clawdbot" },
  { value: "zencoder", label: "Zencoder" },
  { value: "neovate", label: "Neovate" },
  { value: "mcpjam", label: "MCPJam" },
]

export const DEFAULT_MCP_AGENTS = ["cursor", "claude-code", "vscode"]
export const DEFAULT_SKILL_AGENTS = ["cursor", "claude-code", "github-copilot"]

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function detectPackageManager(project: string): Promise<PackageManager> {
  if (await pathExists(join(project, "bun.lock")) || await pathExists(join(project, "bun.lockb")) || await pathExists(join(project, "bunfig.toml"))) {
    return "bun"
  }

  if (await pathExists(join(project, "pnpm-lock.yaml"))) {
    return "pnpm"
  }

  if (await pathExists(join(project, "yarn.lock"))) {
    return "yarn"
  }

  if (await pathExists(join(project, "package-lock.json"))) {
    return "npm"
  }

  if (process.versions.bun) {
    return "bun"
  }

  return "npm"
}

function getPackageRunnerPrefix(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case "bun":
      return ["bunx"]
    case "pnpm":
      return ["pnpm", "dlx"]
    case "yarn":
      return ["yarn", "dlx"]
    default:
      return ["npx"]
  }
}

async function runPackageCommand(project: string, packageManager: PackageManager, args: string[]) {
  const prefix = getPackageRunnerPrefix(packageManager)
  const command = prefix[0] ?? "npx"
  const commandArgs = [...prefix.slice(1), ...args]

  await execa(command, commandArgs, {
    cwd: project,
    env: {
      ...process.env,
      CI: "true",
    },
  })
}

export async function executeInstallations({
  project,
  selectedSkills,
  selectedServers,
  mcpAgents,
  skillAgents,
}: {
  project: string
  selectedSkills: ResolvedSkillEntry[]
  selectedServers: McpServerEntry[]
  mcpAgents: string[]
  skillAgents: string[]
}): Promise<InstallExecutionSummary> {
  const packageManager = await detectPackageManager(project)
  const summary: InstallExecutionSummary = {
    packageManager,
    skills: {
      installed: [],
      failed: [],
    },
    mcp: {
      installed: [],
      failed: [],
    },
  }

  for (const skill of selectedSkills) {
    try {
      await runPackageCommand(project, packageManager, [
        "skills@latest",
        "add",
        skill.source,
        "--skill",
        ...skill.resolvedSkills,
        "--agent",
        ...skillAgents,
        "-y",
      ])
      summary.skills.installed.push(skill)
    } catch (error) {
      summary.skills.failed.push({
        item: skill,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const server of selectedServers) {
    try {
      await runPackageCommand(project, packageManager, [
        "add-mcp@latest",
        server.target,
        "--name",
        server.name,
        ...(server.transport ? ["-t", server.transport] : []),
        ...(server.headers ?? []).flatMap((header) => ["--header", header]),
        ...mcpAgents.flatMap((agent) => ["-a", agent]),
        "-y",
      ])
      summary.mcp.installed.push(server)
    } catch (error) {
      summary.mcp.failed.push({
        item: server,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return summary
}
