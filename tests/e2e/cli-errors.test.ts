import { afterEach, expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runCli } from "../helpers/cli"
import { createTempDir, removeTempDir } from "../helpers/temp-dir"

const currentDir = dirname(fileURLToPath(import.meta.url))
const nextAppFixture = join(currentDir, "..", "fixtures", "projects", "next-app")

// Point config resolution at a path that doesn't exist so auto mode falls back
// to built-in defaults instead of reading the developer's real config.
const noConfig = { BTTRAI_CONFIG: join(currentDir, "no-such-config-xyz.json") }

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) {
    removeTempDir(dir)
  }
  tempDirs.length = 0
})

test("detect auto without agent resolves agents automatically (no error)", () => {
  const result = runCli(["detect", nextAppFixture, "--json", "--auto"], noConfig)

  expect(result.status).toBe(0)
  const json = JSON.parse(result.stdout) as { selectedMcpServers: unknown[] }
  expect(json.selectedMcpServers.length).toBeGreaterThan(0)
})

test("detect errors clearly when the project directory does not exist", () => {
  const missing = join(currentDir, "no-such-dir-xyz")
  const result = runCli(["detect", missing, "--json"])
  const output = `${result.stdout}\n${result.stderr}`

  expect(result.status).not.toBe(0)
  expect(output).toContain("Project directory not found")
})

test("install errors clearly when the project directory does not exist", () => {
  const missing = join(currentDir, "no-such-dir-xyz")
  const result = runCli(["install", "ai", "--project", missing, "--json"])
  const output = `${result.stdout}\n${result.stderr}`

  expect(result.status).not.toBe(0)
  expect(output).toContain("Project directory not found")
})

test("detect errors when project manifest is missing", () => {
  const tempDir = createTempDir()
  tempDirs.push(tempDir)

  const result = runCli(["detect", tempDir, "--json"])
  const output = `${result.stdout}\n${result.stderr}`

  expect(result.status).not.toBe(0)
  expect(output).toContain("Could not find")
  expect(output).toContain("package.json")
  expect(output).toContain("pyproject.toml")
})
