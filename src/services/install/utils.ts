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
import type {
  AgentOption,
  McpServerEntry,
  McpTransport,
  SkillEntry,
  WhenCondition,
} from "../../registry/types"
import { mcpServers } from "../../registry/mcp-servers"
import { skills as skillRegistry } from "../../registry/skills"
import { getSkillDetectionSourceHint } from "../shared/skill-source"
import { pathExists } from "../shared/utils"
import type { ResolvedSkillEntry } from "../matcher/types"
import type { Preset } from "../config/types"
import { z } from "zod"
import { installOptions, type InstallFlags } from "./types"

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
    // No skill agents resolved (e.g. a project whose only detected agent has no
    // skills CLI) — skip rather than emit a `--agent`-less command.
    if (skillAgents.length === 0) break
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
    if (mcpAgents.length === 0) break
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

// First registry SkillEntry that owns each skill name, so a preset's flat skill
// list can be regrouped back into source-keyed install entries. Built once.
const skillEntryByName = new Map<string, SkillEntry>()
for (const entry of skillRegistry) {
  const names = [...entry.skills, ...(entry.conditionalSkills?.flatMap((c) => c.skills) ?? [])]
  for (const name of names) {
    if (!skillEntryByName.has(name)) skillEntryByName.set(name, entry)
  }
}

const mcpByKey = new Map(mcpServers.map((server) => [server.key, server]))

// A preset mcp string is either a registry key (a plain slug like "context7") or
// a raw target installed verbatim — a URL or a command (`npx ...`, `@scope/pkg`).
// Registry keys never carry target syntax, so its presence marks a raw target.
export function isRawMcpTarget(value: string): boolean {
  return (
    value.includes("://") ||
    value.includes(" ") ||
    value.startsWith("@") ||
    value.startsWith("npx") ||
    value.includes("/")
  )
}

// Build an McpServerEntry from a raw target, inferring a name + transport so it
// drops into the same `add-mcp` command a registry entry would.
function rawMcpEntry(target: string): McpServerEntry {
  if (target.includes("://")) {
    let url: URL
    try {
      url = new URL(target)
    } catch {
      // Fall through to the command (stdio) form if the URL is malformed.
      const name = target.replace(/^[a-z]+:\/\//, "").split(/[\/:]/)[0] ?? target
      return { key: target, label: name, name, target, when: { deps: [] } }
    }
    const name =
      url.hostname.split(".").find((part) => !["mcp", "www", "api"].includes(part)) ?? url.hostname
    const transport: McpTransport = url.pathname.endsWith("/sse") ? "sse" : "http"
    return { key: target, label: name, name, target, transport, when: { deps: [] } }
  }
  // Command (stdio) form: name from the first package-like token, scope/version stripped.
  const token =
    target.split(/\s+/).find((part) => part && !["npx", "bunx", "-y", "--yes"].includes(part)) ??
    target
  const name = token.replace(/^@[^/]+\//, "").replace(/@[^@]*$/, "")
  return { key: target, label: name, name, target, when: { deps: [] } }
}

// Parse a raw skill string "owner/repo#skillA,skillB" into a source + the
// explicit skill names to install from it. Returns null for a plain registry
// skill name (no "/"). The skills CLI resolves names against the source repo
// itself, so no in-repo path is needed.
export function parseRawSkill(value: string): { source: string; names: string[] } | null {
  if (!value.includes("/")) return null
  const [source = value, list = ""] = value.split("#")
  const names = list
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  return { source, names }
}

// Turn a preset's mcp + skill entries into the shapes the install pipeline
// consumes. Each entry is either a registry reference (looked up) or a raw
// target/source (used verbatim). Preset skills carry the "fallback" detection
// source since they aren't fetched. Unresolvable entries are skipped
// (validateConfig rejects them before a preset resolves).
export function presetToExtras(preset: Preset): {
  servers: McpServerEntry[]
  skills: ResolvedSkillEntry[]
} {
  const servers: McpServerEntry[] = []
  const seenServers = new Set<string>()
  for (const value of preset.mcp ?? []) {
    const entry = isRawMcpTarget(value) ? rawMcpEntry(value) : mcpByKey.get(value)
    if (!entry || seenServers.has(entry.key)) continue
    seenServers.add(entry.key)
    servers.push(entry)
  }

  const bySource = new Map<
    string,
    { source: string; label: string; skills: string[]; when: WhenCondition; names: string[] }
  >()
  for (const value of preset.skills ?? []) {
    const raw = parseRawSkill(value)
    const entry = raw ? null : skillEntryByName.get(value)
    const source = raw ? raw.source : entry?.source
    if (!source) continue
    const names = raw ? raw.names : [value]
    if (names.length === 0) continue
    const group = bySource.get(source) ?? {
      source,
      label: raw ? raw.source : (entry?.label ?? source),
      skills: raw ? raw.names : (entry?.skills ?? names),
      when: raw ? { deps: [] } : (entry?.when ?? { deps: [] }),
      names: [] as string[],
    }
    for (const name of names) {
      if (!group.names.includes(name)) group.names.push(name)
    }
    bySource.set(source, group)
  }

  const skills: ResolvedSkillEntry[] = [...bySource.values()].map((group) => ({
    source: group.source,
    label: group.label,
    skills: group.skills,
    when: group.when,
    resolvedSkills: group.names,
    resolvedSkillPaths: group.names,
    detectionSource: "fallback",
    installed: false,
  }))

  return { servers, skills }
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

// The shared install flags (all optional) plus the leftover tokens to forward.
export type HoistedInstallFlags = InstallFlags & {
  // Package names + genuine package-manager flags, forwarded verbatim.
  rest: string[]
}

// How a flag consumes its arguments: a boolean is a bare switch, a value takes
// one token, an array greedily consumes following non-flag tokens.
type FlagArity = "boolean" | "value" | "array"

function flagArity(schema: z.ZodType): FlagArity {
  // Peel the `.optional()` wrapper to inspect the underlying type.
  const wrapped = schema as { unwrap?: () => z.ZodType }
  const inner = typeof wrapped.unwrap === "function" ? wrapped.unwrap() : schema
  if (inner instanceof z.ZodBoolean) return "boolean"
  if (inner instanceof z.ZodArray) return "array"
  return "value"
}

// `--flag` -> arity, derived from the shared schema so the recognised flags and
// their value handling never drift from `installOptions`.
const installFlagArities = new Map<string, FlagArity>(
  Object.entries(installOptions.shape).map(([key, schema]) => [
    `--${key}`,
    flagArity(schema as z.ZodType),
  ]),
)

// Splits a raw arg list into bttrai's own flags vs. everything else. This lets
// `--project`, `--skills`, etc. work even when they land after `--` (where they
// would otherwise be forwarded blindly to the package manager). Everything not
// recognised — package names and real package-manager flags — goes to `rest`.
//   - value flags take the next token (`--project ./app`)
//   - array flags consume following non-flag tokens (`--agent cursor claude-code`)
export function hoistInstallFlags(rawArgs: string[]): HoistedInstallFlags {
  const out: HoistedInstallFlags = { rest: [] }
  const flags = out as Record<string, unknown>

  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i]
    if (!token) continue

    const arity = installFlagArities.get(token)

    if (!arity) {
      out.rest.push(token)
      continue
    }

    const key = token.slice(2)
    if (arity === "boolean") {
      flags[key] = true
    } else if (arity === "value") {
      flags[key] = rawArgs[++i]
    } else {
      const values: string[] = []
      while (i + 1 < rawArgs.length && !rawArgs[i + 1]!.startsWith("-")) {
        values.push(rawArgs[++i]!)
      }
      flags[key] = [...((flags[key] as string[] | undefined) ?? []), ...values]
    }
  }

  return out
}

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
