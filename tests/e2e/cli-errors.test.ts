import { afterEach, expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runCli } from "../helpers/cli"
import { createTempDir, removeTempDir } from "../helpers/temp-dir"

const currentDir = dirname(fileURLToPath(import.meta.url))
const nextAppFixture = join(currentDir, "..", "fixtures", "projects", "next-app")

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) {
    removeTempDir(dir)
  }
  tempDirs.length = 0
})

test("install auto without agent exits with an error", () => {
  const result = runCli(["install", "--project", nextAppFixture, "--json", "--auto"])
  const output = `${result.stdout}\n${result.stderr}`

  expect(result.status).toBe(1)
  expect(output).toContain("--auto requires --agent to be specified")
})

test("detect errors when project manifest is missing", () => {
  const tempDir = createTempDir()
  tempDirs.push(tempDir)

  const result = runCli(["detect", "--project", tempDir, "--json"])
  const output = `${result.stdout}\n${result.stderr}`

  expect(result.status).not.toBe(0)
  expect(output).toContain("Could not find")
  expect(output).toContain("package.json")
  expect(output).toContain("pyproject.toml")
})
