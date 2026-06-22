import { afterEach, expect, test } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { translateAgents } from "../../src/registry/agents"
import { configService } from "../../src/services/config"
import {
  autoDetectAgents,
  getConfigPath,
  openInEditor,
  readConfigFile,
  validateConfig,
  writeConfig,
} from "../../src/services/config/utils"
import { createTempDir, removeTempDir } from "../helpers/temp-dir"

const tempDirs: string[] = []
const originalConfigEnv = process.env.BTTRAI_CONFIG
const originalEditorEnv = process.env.EDITOR

function tempProject() {
  const dir = createTempDir()
  tempDirs.push(dir)
  return dir
}

// Each config test points BTTRAI_CONFIG at a fresh temp file.
function tempConfig(contents?: string) {
  const dir = tempProject()
  const path = join(dir, "config.json")
  if (contents !== undefined) writeFileSync(path, contents)
  process.env.BTTRAI_CONFIG = path
  return path
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeTempDir(dir)
  if (originalConfigEnv === undefined) delete process.env.BTTRAI_CONFIG
  else process.env.BTTRAI_CONFIG = originalConfigEnv
  if (originalEditorEnv === undefined) delete process.env.EDITOR
  else process.env.EDITOR = originalEditorEnv
})

// --- validation -----------------------------------------------------------

test("validateConfig accepts a default config and applies defaults", () => {
  const result = validateConfig({})
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("expected ok")
  expect(result.config.autoAgents).toBe(true)
  expect(result.config.agents).toEqual([])
})

test("validateConfig rejects an invalid shape", () => {
  const result = validateConfig({ autoAgents: "yes", agents: "cursor" })
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error("expected failure")
  expect(result.errors.every((e) => e.type === "schema")).toBe(true)
})

test("validateConfig rejects an unknown agent", () => {
  const result = validateConfig({ autoAgents: false, agents: ["not-an-agent"] })
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error("expected failure")
  expect(result.errors.some((e) => e.type === "agent")).toBe(true)
})

test("validateConfig rejects a preset referencing a missing MCP server or skill", () => {
  const badMcp = validateConfig({ presets: { p: { mcp: ["nope-server"] } } })
  const badSkill = validateConfig({ presets: { p: { skills: ["nope-skill"] } } })
  expect(badMcp.ok).toBe(false)
  expect(badSkill.ok).toBe(false)
  if (badMcp.ok || badSkill.ok) throw new Error("expected failure")
  expect(badMcp.errors.some((e) => e.type === "preset")).toBe(true)
  expect(badSkill.errors.some((e) => e.type === "preset")).toBe(true)
})

test("validateConfig accepts presets referencing real registry entries", () => {
  const result = validateConfig({
    presets: { frontend: { mcp: ["context7"], skills: ["ai-sdk"] } },
  })
  expect(result.ok).toBe(true)
})

test("validateConfig accepts an editor string", () => {
  const result = validateConfig({ editor: "nvim" })
  expect(result.ok).toBe(true)
})

test("validateConfig rejects a non-string editor", () => {
  const result = validateConfig({ editor: 123 })
  expect(result.ok).toBe(false)
})

// --- agent translation -----------------------------------------------------

test("translateAgents maps canonical agents to MCP and skill targets", () => {
  const { mcp, skill } = translateAgents(["github-copilot", "vscode", "cursor"])
  // github-copilot's MCP target differs from its skill target; vscode is MCP-only.
  expect(mcp).toEqual(["github-copilot-cli", "vscode", "cursor"])
  expect(skill).toEqual(["github-copilot", "cursor"])
})

// --- agent resolution per mode ---------------------------------------------

test("autoAgents:true resolves agents automatically and ignores `agents`", async () => {
  tempConfig(JSON.stringify({ autoAgents: true, agents: ["github-copilot"] }))
  const project = tempProject()
  mkdirSync(join(project, ".cursor"))

  const resolved = await configService.resolveConfiguredAgents(project)
  // Detected from the project's .cursor dir, NOT the ignored `agents` list.
  expect(resolved).toEqual(["cursor"])
})

test("autoAgents:false uses the pinned `agents` list as-is", async () => {
  tempConfig(JSON.stringify({ autoAgents: false, agents: ["claude-code", "vscode"] }))
  const project = tempProject()

  const resolved = await configService.resolveConfiguredAgents(project)
  expect(resolved).toEqual(["claude-code", "vscode"])
})

test("autoAgents:false with empty `agents` falls back to prompting (null)", async () => {
  tempConfig(JSON.stringify({ autoAgents: false, agents: [] }))
  const project = tempProject()

  const resolved = await configService.resolveConfiguredAgents(project)
  expect(resolved).toBeNull()
})

test("autoDetectAgents falls back to defaults when no agent dirs exist", async () => {
  const project = tempProject()
  const resolved = await autoDetectAgents(project)
  expect(resolved.length).toBeGreaterThan(0)
  expect(resolved).toContain("cursor")
})

// --- file IO ---------------------------------------------------------------

test("readConfigFile reports malformed JSON without throwing", async () => {
  const path = tempConfig("{ not valid json")
  const file = await readConfigFile(path)
  expect(file.exists).toBe(true)
  expect("jsonError" in file).toBe(true)
})

test("resolving config never writes the agents field", async () => {
  const raw = JSON.stringify({ autoAgents: false, agents: ["cursor"] }, null, 2)
  const path = tempConfig(raw)

  await configService.resolveConfiguredAgents(tempProject())

  // The file is untouched — bttrai reads `agents` but never persists it.
  expect(readFileSync(path, "utf-8")).toBe(raw)
})

test("getConfigPath honors BTTRAI_CONFIG", () => {
  const path = tempConfig()
  expect(getConfigPath()).toBe(path)
})

test("run lazily creates the file and reports its path", async () => {
  const path = tempConfig()

  const result = await configService.run({ json: true })

  expect(result.path).toBe(path)
  expect(result.created).toBe(true)
  expect(configService.json(result)).toEqual({ path })

  const written = await readConfigFile(path)
  expect(written.exists).toBe(true)
  if (!("raw" in written)) throw new Error("expected created config")
  const validated = validateConfig(written.raw)
  expect(validated.ok).toBe(true)
})

test("run reads the editor field leniently from an existing file", async () => {
  tempConfig(JSON.stringify({ editor: "nvim" }))

  const result = await configService.run()

  expect(result.created).toBe(false)
  expect(result.editor).toBe("nvim")
})

// --- editor resolution -----------------------------------------------------

test("openInEditor uses the configured editor over $EDITOR", async () => {
  // `false` exits non-zero (would throw); `true` exits 0. Passing `true` as the
  // configured editor proves it wins over $EDITOR.
  process.env.EDITOR = "false"
  const opened = await openInEditor("/tmp/whatever", "true")
  expect(opened).toBe(true)
})

test("openInEditor falls back to $EDITOR when none is configured", async () => {
  process.env.EDITOR = "true"
  const opened = await openInEditor("/tmp/whatever")
  expect(opened).toBe(true)
})

test("writeConfig + readConfigFile round-trips", async () => {
  const path = tempConfig()
  await writeConfig({ autoAgents: true, agents: [], presets: {} }, path)
  const file = await readConfigFile(path)
  expect(file.exists).toBe(true)
  if (!("raw" in file)) throw new Error("expected raw config")
  expect((file.raw as { autoAgents: boolean }).autoAgents).toBe(true)
})
