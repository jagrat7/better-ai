import { afterEach, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import type { McpServerEntry } from "../../src/registry/types"
import type { ResolvedSkillEntry } from "../../src/services/matcher/types"
import {
  executeInstallations,
  extractPackageNames,
  hoistInstallFlags,
  resolvePackageManager,
} from "../../src/services/install/utils"
import { createTempDir, removeTempDir } from "../helpers/temp-dir"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeTempDir(dir)
  }
})

test("extractPackageNames keeps packages, strips versions, and ignores flags", () => {
  expect(extractPackageNames(["-D", "ai@5", "@scope/pkg@1.2.3", "react"])).toEqual([
    "ai",
    "@scope/pkg",
    "react",
  ])
})

test("extractPackageNames skips the value of a space-form dir flag", () => {
  expect(extractPackageNames(["-C", "../app", "react"])).toEqual(["react"])
  expect(extractPackageNames(["--dir=../app", "react"])).toEqual(["react"])
})

test("resolvePackageManager falls back to npm when preferred runner is unavailable", async () => {
  const project = createTempDir()
  tempDirs.push(project)
  writeFileSync(`${project}/bun.lock`, "")

  const result = await resolvePackageManager(
    project,
    async (packageManager) => packageManager === "npm",
  )

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
      resolvedSkillPaths: ["packages/ai/skills/ai-sdk"],
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
  expect(summary.skills.failed[0]?.error).toContain(
    "Try manually with: npx skills@latest add vercel/ai --skill ai-sdk --agent cursor -y",
  )
  expect(summary.mcp.failed[0]?.error).toContain(
    "Try manually with: npx add-mcp@latest @upstash/context7-mcp --name context7 -a cursor -y",
  )
})

test("hoistInstallFlags pulls bttrai flags out of forwarded args", () => {
  const result = hoistInstallFlags(["zod", "-D", "--project", "./app", "--skills"])

  expect(result.project).toBe("./app")
  expect(result.skills).toBe(true)
  expect(result.rest).toEqual(["zod", "-D"])
})

test("hoistInstallFlags supports --agent variadic", () => {
  const result = hoistInstallFlags([
    "ai",
    "--project",
    "./app",
    "--agent",
    "cursor",
    "claude-code",
    "-D",
  ])

  expect(result.project).toBe("./app")
  expect(result.agent).toEqual(["cursor", "claude-code"])
  expect(result.rest).toEqual(["ai", "-D"])
})

test("hoistInstallFlags leaves pure package-manager args untouched", () => {
  const result = hoistInstallFlags(["zod", "-D", "--save-exact"])

  expect(result.project).toBeUndefined()
  expect(result.rest).toEqual(["zod", "-D", "--save-exact"])
})
