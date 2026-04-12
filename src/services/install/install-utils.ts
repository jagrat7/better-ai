import { access } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"
import type { McpServerEntry } from "../../registry/types"
import type { ResolvedSkillEntry } from "../matcher/matcher"


export type PackageManager = "bun" | "pnpm" | "yarn" | "npm" | "deno"

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


async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const packageManagerChecks: { files: string[], manager: PackageManager }[] = [
  { files: ["deno.lock", "deno.json", "deno.jsonc"], manager: "deno" },
  { files: ["bun.lock", "bun.lockb", "bunfig.toml"], manager: "bun" },
  { files: ["pnpm-lock.yaml"], manager: "pnpm" },
  { files: ["yarn.lock"], manager: "yarn" },
  { files: ["package-lock.json"], manager: "npm" },
]

export async function detectPackageManager(project: string): Promise<PackageManager> {
  for (const { files, manager } of packageManagerChecks) {
    const exists = await Promise.all(files.map(f => pathExists(join(project, f))))
    if (exists.some(Boolean)) {
      return manager
    }
  }

  return process.versions.bun ? "bun" : "npm"
}

function getPackageRunnerArgs(packageManager: PackageManager, args: string[]): { command: string, args: string[] } {
  const [pkg, ...rest] = args
  switch (packageManager) {
    case "deno":
      return { command: "deno", args: ["run", "--allow-all", `npm:${pkg}`, ...rest] }
    case "bun":
      return { command: "bunx", args }
    case "pnpm":
      return { command: "pnpm", args: ["dlx", ...args] }
    case "yarn":
      return { command: "yarn", args: ["dlx", ...args] }
    default:
      return { command: "npx", args }
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
