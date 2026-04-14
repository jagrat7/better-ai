import { expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runCli } from "../helpers/cli"

const currentDir = dirname(fileURLToPath(import.meta.url))
const nextAppFixture = join(currentDir, "..", "fixtures", "projects", "next-app")

test("detect outputs stable JSON for a matching project", () => {
  const result = runCli(["detect", "--project", nextAppFixture, "--json"])

  expect(result.status).toBe(0)

  const json = JSON.parse(result.stdout) as {
    deps: string[]
    mcpServers: Array<{ key: string }>
    skills: Array<{ source: string }>
  }

  expect([...json.deps].sort()).toEqual(["ai", "better-auth", "next"])
  expect(json.mcpServers.map((server) => server.key)).toEqual([
    "context7",
    "shadcn",
    "next-devtools",
    "better-auth",
  ])
  expect(json.skills.map((skill) => skill.source)).toEqual([
    "vercel-labs/agent-skills",
    "vercel/ai",
    "vercel-labs/next-skills",
    "shadcn/ui",
    "better-auth/skills",
  ])
})
