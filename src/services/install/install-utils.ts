import { access } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"
import { getPackageManagerConfig, packageManagers, type PackageManager } from "../../registry/package-managers"
import type { McpServerEntry } from "../../registry/types"
import type { ResolvedSkillEntry } from "../matcher/matcher"


export type InstallFailure<T> = {
  item: T
  error: string
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
    const exists = await Promise.all(files.map(f => pathExists(join(project, f))))
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
): Promise<{ preferredPackageManager: PackageManager, packageManager: PackageManager, usedFallback: boolean }> {
  const preferredPackageManager = await detectPackageManager(project)

  if (await isAvailable(preferredPackageManager)) {
    return {
      preferredPackageManager,
      packageManager: preferredPackageManager,
      usedFallback: false,
    }
  }

  if (preferredPackageManager !== "npm" && await isAvailable("npm")) {
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

function getPackageRunnerArgs(packageManager: PackageManager, args: string[]): { command: string, args: string[] } {
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

function formatManualInstallCommand(args: string[]) {
  return `npx ${args.join(" ")}`
}

function formatInstallFailure(error: unknown, args: string[]) {
  const message = error instanceof Error ? error.message : String(error)
  return `${message}. Try manually with: ${formatManualInstallCommand(args)}`
}

type ExecuteInstallationsDependencies = {
  resolvePackageManager?: typeof resolvePackageManager
  runPackageCommand?: typeof runPackageCommand
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
}, dependencies: ExecuteInstallationsDependencies = {}): Promise<InstallExecutionSummary> {
  const resolvePackageManagerFn = dependencies.resolvePackageManager ?? resolvePackageManager
  const runPackageCommandFn = dependencies.runPackageCommand ?? runPackageCommand
  const { packageManager, preferredPackageManager, usedFallback } = await resolvePackageManagerFn(project)
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
