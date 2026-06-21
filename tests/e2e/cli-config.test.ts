import { afterEach, expect, test } from "bun:test"
import { existsSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runCli } from "../helpers/cli"
import { createTempDir, removeTempDir } from "../helpers/temp-dir"

const currentDir = dirname(fileURLToPath(import.meta.url))
const nextAppFixture = join(currentDir, "..", "fixtures", "projects", "next-app")

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeTempDir(dir)
})

function tempConfigPath() {
  const dir = createTempDir()
  tempDirs.push(dir)
  return join(dir, "config.json")
}

test("bttrai config --json creates the file and prints its path", () => {
  const path = tempConfigPath()
  const result = runCli(["config", "--json"], { BTTRAI_CONFIG: path })

  expect(result.status).toBe(0)
  const json = JSON.parse(result.stdout) as { path: string }
  expect(json.path).toBe(path)
  expect(existsSync(path)).toBe(true)
})

test("bttrai config prints the path in non-TTY mode", () => {
  const path = tempConfigPath()
  const result = runCli(["config"], { BTTRAI_CONFIG: path })

  expect(result.status).toBe(0)
  expect(result.stdout).toContain(path)
})

test("an invalid config stops the run with structured errors", () => {
  const path = tempConfigPath()
  writeFileSync(path, JSON.stringify({ autoAgents: false, agents: ["bogus-agent"] }))

  const result = runCli(["detect", nextAppFixture, "--json", "--auto"], { BTTRAI_CONFIG: path })
  const output = `${result.stdout}\n${result.stderr}`

  expect(result.status).toBe(1)
  expect(output).toContain("bogus-agent")
})
