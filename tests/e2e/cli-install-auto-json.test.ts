import { expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runCli } from "../helpers/cli"

const currentDir = dirname(fileURLToPath(import.meta.url))
const nextAppFixture = join(currentDir, "..", "fixtures", "projects", "next-app")

test("install auto json returns selected items without running installers", () => {
  const result = runCli([
    "install",
    "--project",
    nextAppFixture,
    "--json",
    "--auto",
    "--agent",
    "cursor",
  ])

  expect(result.status).toBe(0)

  const json = JSON.parse(result.stdout) as {
    selectedMcpServers: Array<{ key: string }>
    selectedSkills: Array<{ source: string }>
  }

  expect(json.selectedMcpServers.map((server) => server.key)).toEqual([
    "context7",
    "shadcn",
    "next-devtools",
    "better-auth",
  ])
  expect(json.selectedSkills.map((skill) => skill.source)).toEqual([
    "vercel-labs/agent-skills",
    "vercel/ai",
    "vercel-labs/next-skills",
    "shadcn/ui",
    "better-auth/skills",
  ])
})
