import { afterEach, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import type { McpServerEntry } from "../../src/registry/types"
import type { ResolvedSkillEntry } from "../../src/services/matcher/matcher"
import { executeInstallations, resolvePackageManager } from "../../src/services/install/install-utils"
import { createTempDir, removeTempDir } from "../helpers/temp-dir"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeTempDir(dir)
  }
})

test("resolvePackageManager falls back to npm when preferred runner is unavailable", async () => {
  const project = createTempDir()
  tempDirs.push(project)
  writeFileSync(`${project}/bun.lock`, "")

  const result = await resolvePackageManager(project, async (packageManager) => packageManager === "npm")

  expect(result).toEqual({
    preferredPackageManager: "bun",
    packageManager: "npm",
    usedFallback: true,
  })
})

test("executeInstallations includes manual npx guidance when installer commands fail", async () => {
  const selectedSkills: ResolvedSkillEntry[] = [
    {
      source: "vercel/ai",
      label: "Vercel AI SDK",
      skills: ["ai-sdk"],
      when: { deps: ["ai"] },
      resolvedSkills: ["ai-sdk"],
      installed: false,
    },
  ]
  const selectedServers: McpServerEntry[] = [
    {
      key: "context7",
      label: "Context7",
      name: "context7",
      target: "@upstash/context7-mcp",
      when: { deps: ["*"] },
    },
  ]

  const summary = await executeInstallations(
    {
      project: "/tmp/project",
      selectedSkills,
      selectedServers,
      mcpAgents: ["cursor"],
      skillAgents: ["cursor"],
    },
    {
      resolvePackageManager: async () => ({
        preferredPackageManager: "bun",
        packageManager: "npm",
        usedFallback: true,
      }),
      runPackageCommand: async () => {
        throw new Error("command failed")
      },
    },
  )

  expect(summary.packageManager).toBe("npm")
  expect(summary.preferredPackageManager).toBe("bun")
  expect(summary.usedFallback).toBe(true)
  expect(summary.skills.failed[0]?.error).toContain("Try manually with: npx skills@latest add vercel/ai --skill ai-sdk --agent cursor -y")
  expect(summary.mcp.failed[0]?.error).toContain("Try manually with: npx add-mcp@latest @upstash/context7-mcp --name context7 -a cursor -y")
})
