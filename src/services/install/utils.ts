import { access } from "node:fs/promises"
import { join } from "node:path"
import { log } from "@clack/prompts"
import { execa } from "execa"
import pc from "picocolors"
import { theme } from "../../components/theme"
import {
  getPackageManagerConfig,
  packageManagers,
  type PackageManager,
} from "../../registry/package-managers"
import type { AgentOption, McpServerEntry } from "../../registry/types"
import { getSkillDetectionSourceHint } from "../shared/skill-source"
import type { ResolvedSkillEntry } from "../matcher/types"

export type InstallFailure<T> = {
  item: T
  error: string
}
type ExecuteInstallationsDependencies = {
  resolvePackageManager?: typeof resolvePackageManager
  runPackageCommand?: typeof runPackageCommand
}
export type InstallExecutionSummary = {
  packageManager: PackageManager
  preferredPackageManager: PackageManager
  usedFallback: boolean
  skills: {
    installed: ResolvedSkillEntry[]
    failed: Array<InstallFailure<ResolvedSkillEntry>>
  }
  mcp: {
    installed: McpServerEntry[]
    failed: Array<InstallFailure<McpServerEntry>>
  }
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function detectPackageManager(project: string): Promise<PackageManager> {
  for (const { files, manager } of packageManagers) {
    const exists = await Promise.all(files.map((f) => pathExists(join(project, f))))
    if (exists.some(Boolean)) {
      return manager
    }
  }

  return process.versions.bun ? "bun" : "npm"
}

export async function isPackageManagerAvailable(packageManager: PackageManager): Promise<boolean> {
  const command = getPackageManagerConfig(packageManager).command

  try {
    await execa(command, ["--version"], {
      env: {
        ...process.env,
        CI: "true",
      },
    })
    return true
  } catch {
    return false
  }
}

export async function resolvePackageManager(
  project: string,
  isAvailable: (packageManager: PackageManager) => Promise<boolean> = isPackageManagerAvailable,
): Promise<{
  preferredPackageManager: PackageManager
  packageManager: PackageManager
  usedFallback: boolean
}> {
  const preferredPackageManager = await detectPackageManager(project)

  if (await isAvailable(preferredPackageManager)) {
    return {
      preferredPackageManager,
      packageManager: preferredPackageManager,
      usedFallback: false,
    }
  }

  if (preferredPackageManager !== "npm" && (await isAvailable("npm"))) {
    return {
      preferredPackageManager,
      packageManager: "npm",
      usedFallback: true,
    }
  }

  return {
    preferredPackageManager,
    packageManager: preferredPackageManager,
    usedFallback: false,
  }
}

function getPackageRunnerArgs(
  packageManager: PackageManager,
  args: string[],
): { command: string; args: string[] } {
  const metadata = getPackageManagerConfig(packageManager)
  const command = metadata.runner ?? metadata.command
  return {
    command,
    args: metadata.getRunnerArgs?.(args) ?? args,
  }
}

async function runPackageCommand(project: string, packageManager: PackageManager, args: string[]) {
  const resolved = getPackageRunnerArgs(packageManager, args)

  await execa(resolved.command, resolved.args, {
    cwd: project,
    env: {
      ...process.env,
      CI: "true",
    },
  })
}

// Runs a real package install (e.g. `npm install ai`) using the manager's
// install binary (`command`, not the runner) with rawArgs forwarded verbatim.
// Inherits stdio so the user sees the package manager's own progress output.
export async function runInstallCommand(
  project: string,
  packageManager: PackageManager,
  rawArgs: string[],
) {
  const metadata = getPackageManagerConfig(packageManager)
  await execa(metadata.command, metadata.installArgs(rawArgs), {
    cwd: project,
    stdio: "inherit",
  })
}

function formatManualInstallCommand(args: string[]) {
  return `npx ${args.join(" ")}`
}

function formatInstallFailure(error: unknown, args: string[]) {
  const message = error instanceof Error ? error.message : String(error)
  return `${message}. Try manually with: ${formatManualInstallCommand(args)}`
}

export async function executeInstallations(
  {
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
  },
  dependencies: ExecuteInstallationsDependencies = {},
): Promise<InstallExecutionSummary> {
  const resolvePackageManagerFn = dependencies.resolvePackageManager ?? resolvePackageManager
  const runPackageCommandFn = dependencies.runPackageCommand ?? runPackageCommand
  const { packageManager, preferredPackageManager, usedFallback } =
    await resolvePackageManagerFn(project)
  const summary: InstallExecutionSummary = {
    packageManager,
    preferredPackageManager,
    usedFallback,
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
    const installArgs = [
      "skills@latest",
      "add",
      skill.source,
      "--skill",
      ...skill.resolvedSkills,
      "--agent",
      ...skillAgents,
      "-y",
    ]

    try {
      await runPackageCommandFn(project, packageManager, installArgs)
      summary.skills.installed.push(skill)
    } catch (error) {
      summary.skills.failed.push({
        item: skill,
        error: formatInstallFailure(error, installArgs),
      })
    }
  }

  for (const server of selectedServers) {
    const installArgs = [
      "add-mcp@latest",
      server.target,
      "--name",
      server.name,
      ...(server.transport ? ["-t", server.transport] : []),
      ...(server.headers ?? []).flatMap((header) => ["--header", header]),
      ...mcpAgents.flatMap((agent) => ["-a", agent]),
      "-y",
    ]

    try {
      await runPackageCommandFn(project, packageManager, installArgs)
      summary.mcp.installed.push(server)
    } catch (error) {
      summary.mcp.failed.push({
        item: server,
        error: formatInstallFailure(error, installArgs),
      })
    }
  }

  return summary
}

// Shared reporter for an install execution summary: lists installed MCP
// servers + skills and surfaces per-item failures. Used by both the detect
// flow and the package install.
export function reportInstallExecution(execution: InstallExecutionSummary) {
  if (execution.mcp.installed.length > 0) {
    log.success(pc.bold("Installed MCP Servers"))
    for (const server of execution.mcp.installed) {
      log.message(`  ${theme.bullet} ${server.label} ${theme.hint(`(${server.name})`)}`)
    }
  }

  if (execution.skills.installed.length > 0) {
    log.success(pc.bold("Installed Skills"))
    for (const skill of execution.skills.installed) {
      log.message(
        `  ${theme.bullet} ${skill.label} ${theme.hint(`— ${skill.resolvedSkills.length} skills, ${getSkillDetectionSourceHint(skill)}`)}`,
      )
    }
  }

  for (const failure of execution.mcp.failed) {
    log.warn(`Failed to install MCP server ${pc.bold(failure.item.name)}: ${failure.error}`)
  }

  for (const failure of execution.skills.failed) {
    log.warn(`Failed to install skills from ${pc.bold(failure.item.source)}: ${failure.error}`)
  }
}

export function agentOptionsWithHints(agents: AgentOption[]) {
  return agents.map((a) => ({
    value: a.value,
    label: a.globalOnly ? `${a.label} ${pc.dim("(global only)")}` : a.label,
  }))
}

export function warnGlobalOnlyAgents(selected: string[], agents: AgentOption[]) {
  const globalOnlyMap = new Map(agents.filter((a) => a.globalOnly).map((a) => [a.value, a.label]))
  const picked = selected.filter((v) => globalOnlyMap.has(v))
  if (picked.length > 0) {
    const names = picked.map((v) => pc.bold(globalOnlyMap.get(v)!)).join(", ")
    log.warn(`${names} — global install only (no project-level config)`)
  }
}

// Package-manager flags that take a directory value. We skip their value when
// recovering package names so a path (e.g. the `../app` in `-- -C ../app`) isn't
// mistaken for a package.
const projectDirFlags = new Set(["-C", "--dir", "--prefix", "--cwd"])

// Pulls installable package names out of a raw package-manager arg string so
// their registry extras can be resolved. Contract:
//   - a token is a package only when it is NOT a flag (does not start with "-")
//   - the value of a space-form dir flag (`-C ../app`) is skipped, not a package
//   - strip a trailing @version / @tag before matching (ai@5 -> ai)
//   - keep scoped names intact (@scope/pkg stays @scope/pkg; @scope/pkg@5 -> @scope/pkg)
export function extractPackageNames(rawArgs: string[]): string[] {
  const names: string[] = []
  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i]
    if (!token) continue
    if (token.startsWith("-")) {
      // Skip the value following a space-form dir flag; `--dir=../app` is already
      // excluded by the leading "-" check.
      if (projectDirFlags.has(token)) i++
      continue
    }
    const at = token.lastIndexOf("@")
    names.push(at > 0 ? token.slice(0, at) : token)
  }
  return names
}
