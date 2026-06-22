import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir, platform } from "node:os"
import { dirname, join } from "node:path"
import { cancel, isCancel, log, select } from "@clack/prompts"
import { execa } from "execa"
import pc from "picocolors"
import { canonicalAgentIds, defaultAgents } from "../../registry/agents"
import { mcpServers } from "../../registry/mcp-servers"
import { skills as skillEntries } from "../../registry/skills"
import { pathExists } from "../shared/utils"
import { configSchema, defaultConfig } from "./types"
import type { Config, ConfigError, ConfigInput, ConfigValidation, RawConfigFile } from "./types"

const APP = "bttrai"
const CONFIG_FILE = "config.json"

// Project-relative config dirs/files that signal an agent is in use, for auto
// mode's runtime detection.
const agentMarkers: Record<string, string[]> = {
  cursor: [".cursor"],
  "claude-code": [".claude", "CLAUDE.md"],
  "github-copilot": [".github/copilot-instructions.md"],
  vscode: [".vscode"],
}

// Registry-backed lookup sets used to validate config references.
const knownAgents = new Set(canonicalAgentIds)
const knownMcpKeys = new Set(mcpServers.map((s) => s.key))
const knownSkillNames = new Set(
  skillEntries.flatMap((s) => [
    ...s.skills,
    ...(s.conditionalSkills?.flatMap((c) => c.skills) ?? []),
  ]),
)

// Resolve the config file path for the current OS. `BTTRAI_CONFIG` is an
// explicit override (also used to keep tests hermetic).
export function getConfigPath(): string {
  const override = process.env.BTTRAI_CONFIG
  if (override) return override

  const home = homedir()
  switch (platform()) {
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), APP, CONFIG_FILE)
    case "darwin":
      return join(home, "Library", "Application Support", APP, CONFIG_FILE)
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), APP, CONFIG_FILE)
  }
}

// Read + JSON-parse the config file. A missing file is not an error (auto mode
// stores nothing); a malformed file is reported as `jsonError` so callers can
// surface it without throwing.
export async function readConfigFile(path = getConfigPath()): Promise<RawConfigFile> {
  let text: string
  try {
    text = await readFile(path, "utf-8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exists: false }
    }
    throw error
  }

  try {
    return { exists: true, raw: JSON.parse(text) }
  } catch (error) {
    return { exists: true, jsonError: error instanceof Error ? error.message : String(error) }
  }
}

export async function writeConfig(config: Config, path = getConfigPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}

// Auto mode: resolve agent targets from config dirs present in the project,
// falling back to built-in defaults when none are found. Persists nothing.
export async function autoDetectAgents(project: string): Promise<string[]> {
  const found: string[] = []
  for (const id of canonicalAgentIds) {
    const markers = agentMarkers[id] ?? []
    const hits = await Promise.all(markers.map((m) => pathExists(join(project, m))))
    if (hits.some(Boolean)) found.push(id)
  }
  return found.length > 0 ? found : [...defaultAgents]
}

// Linux: open in the system's default *text* editor. We query the handler for
// `text/plain` rather than letting xdg-open pick the `.json` association, which
// is often a browser. Returns false if nothing is registered or the launch
// tooling is missing.
async function openLinuxTextEditor(path: string): Promise<boolean> {
  const { stdout } = await execa("xdg-mime", ["query", "default", "text/plain"])
  const appId = stdout.trim().replace(/\.desktop$/, "")
  if (!appId) return false
  await execa("gtk-launch", [appId, path])
  return true
}

// Open `path` in an editor, in order of preference:
//   1. config `editor` (persistent user choice — wins, like git's core.editor)
//   2. $EDITOR
//   3. the OS default *text editor* (not the .json file association)
// Returns false if none is available so callers can print the path instead.
// Never hands a .json file to the browser.
export async function openInEditor(path: string, configuredEditor?: string): Promise<boolean> {
  const editor = configuredEditor ?? process.env.EDITOR
  if (editor) {
    await execa(editor, [path], { stdio: "inherit" })
    return true
  }

  try {
    switch (platform()) {
      case "darwin":
        // `-t` opens in the default text editor (TextEdit unless changed).
        await execa("open", ["-t", path])
        return true
      case "win32":
        await execa("notepad", [path], { stdio: "inherit" })
        return true
      default:
        return await openLinuxTextEditor(path)
    }
  } catch {
    return false
  }
}

// Validate already-parsed config data (JSON parsing happens in readConfigFile).
// Checks shape, known canonical agents, and that preset mcp/skill references
// resolve to real registry entries.
export function validateConfig(raw: unknown): ConfigValidation {
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    // This project's tsc can't resolve zod's `zod/v4/core` subpath, so `.issues`
    // degrades to `never`; read it through a minimal typed view.
    const { issues } = parsed.error as unknown as {
      issues: { path: PropertyKey[]; message: string }[]
    }
    return {
      ok: false,
      errors: issues.map((issue) => ({
        type: "schema",
        message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      })),
    }
  }

  const config = parsed.data
  const errors: ConfigError[] = []

  for (const agent of config.agents) {
    if (!knownAgents.has(agent)) {
      errors.push({
        type: "agent",
        message: `Unknown agent "${agent}". Known agents: ${[...knownAgents].join(", ")}`,
      })
    }
  }

  // Same resolver gap: `z.record` value types degrade to `unknown` under tsc.
  const presets = Object.entries(config.presets) as [
    string,
    { mcp?: string[]; skills?: string[] },
  ][]
  for (const [name, preset] of presets) {
    for (const key of preset.mcp ?? []) {
      if (!knownMcpKeys.has(key)) {
        errors.push({
          type: "preset",
          message: `Preset "${name}" references unknown MCP server "${key}"`,
        })
      }
    }
    for (const skill of preset.skills ?? []) {
      if (!knownSkillNames.has(skill)) {
        errors.push({
          type: "preset",
          message: `Preset "${name}" references unknown skill "${skill}"`,
        })
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, config }
}

// Invalid config recovery: TTY prompts to fix/reset/abort; non-TTY or JSON
// prints structured errors and exits non-zero. Never auto-mutates on failure
// outside the explicit "reset" choice.
async function handleInvalidConfig(
  errors: ConfigError[],
  path: string,
  { json }: ConfigInput,
): Promise<Config> {
  const interactive = process.stdout.isTTY && !json

  if (!interactive) {
    if (json) {
      console.log(JSON.stringify({ ok: false, path, configErrors: errors }, null, 2))
    } else {
      console.error(pc.red(`Invalid bttrai config at ${path}:`))
      for (const error of errors) {
        console.error(pc.red(`  - [${error.type}] ${error.message}`))
      }
    }
    process.exit(1)
  }

  log.error(`Invalid bttrai config at ${pc.dim(path)}`)
  for (const error of errors) {
    log.message(`  ${pc.red("•")} ${pc.dim(`[${error.type}]`)} ${error.message}`)
  }

  const action = await select({
    message: "How do you want to proceed?",
    options: [
      { value: "open", label: "Open config to fix" },
      { value: "reset", label: "Reset to defaults" },
      { value: "abort", label: "Abort" },
    ],
  })

  if (isCancel(action) || action === "abort") {
    cancel("Aborted")
    process.exit(1)
  }

  if (action === "reset") {
    await writeConfig(defaultConfig, path)
    log.success("Config reset to defaults")
    return defaultConfig
  }

  // openInEditor throws when a configured editor / $EDITOR command fails (only
  // the OS-default fallback swallows errors). Catch it so an invalid config plus
  // a broken $EDITOR degrades to printing the path instead of a raw stack trace,
  // matching configService.command's handling.
  try {
    const opened = await openInEditor(path)
    if (!opened) {
      log.info(`Set $EDITOR (or "editor" in config) to open it automatically. Config path: ${path}`)
    }
  } catch (error) {
    log.warn(`Could not open an editor: ${error instanceof Error ? error.message : String(error)}`)
    log.info(`Config path: ${path}`)
  }
  log.info("Re-run bttrai once you've fixed the config.")
  process.exit(1)
}

// Load + validate the config. Missing file → defaults (auto mode stores
// nothing). Invalid → handleInvalidConfig (prompt or exit).
export async function resolveConfig({ json }: ConfigInput = {}): Promise<Config> {
  const path = getConfigPath()
  const file = await readConfigFile(path)

  if (!file.exists) return defaultConfig

  if ("jsonError" in file) {
    return handleInvalidConfig(
      [{ type: "json", message: `Malformed JSON: ${file.jsonError}` }],
      path,
      { json },
    )
  }

  const validation = validateConfig(file.raw)
  if (validation.ok) return validation.config

  return handleInvalidConfig(validation.errors, path, { json })
}
