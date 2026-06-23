import { afterEach, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import {
  executeInstallations,
  extractPackageNames,
  hoistInstallFlags,
  isRawMcpTarget,
  parseRawSkill,
  presetToExtras,
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

// --- preset merging --------------------------------------------------------

test("presetToExtras maps mcp keys to servers and groups skills by source", () => {
  const extras = presetToExtras({ mcp: ["context7"], skills: ["ai-sdk", "shadcn"] })

  expect(extras.servers.map((s) => s.key)).toEqual(["context7"])
  // Each skill regroups under its owning registry source as a fallback entry.
  const ai = extras.skills.find((s) => s.source === "vercel/ai")
  expect(ai?.resolvedSkills).toEqual(["ai-sdk"])
  expect(ai?.detectionSource).toBe("fallback")
  expect(extras.skills.find((s) => s.source === "shadcn/ui")?.resolvedSkills).toEqual(["shadcn"])
})

test("presetToExtras tolerates empty mcp/skills", () => {
  expect(presetToExtras({})).toEqual({ servers: [], skills: [] })
})

test("presetToExtras builds a remote MCP server from a raw URL target", () => {
  const extras = presetToExtras({ mcp: ["https://mcp.sentry.dev/mcp"] })
  expect(extras.servers).toHaveLength(1)
  const server = extras.servers[0]
  // Name derived from the hostname (mcp/www/api labels stripped); http transport.
  expect(server?.name).toBe("sentry")
  expect(server?.target).toBe("https://mcp.sentry.dev/mcp")
  expect(server?.transport).toBe("http")
})

test("presetToExtras infers sse transport from a /sse endpoint", () => {
  const extras = presetToExtras({ mcp: ["https://example.com/sse"] })
  expect(extras.servers[0]?.transport).toBe("sse")
})

test("presetToExtras installs explicit skills from a raw source repo", () => {
  const extras = presetToExtras({
    skills: ["neondatabase/agent-skills#neon-auth,neon-postgres"],
  })
  expect(extras.skills).toHaveLength(1)
  const skill = extras.skills[0]
  expect(skill?.source).toBe("neondatabase/agent-skills")
  expect(skill?.resolvedSkills).toEqual(["neon-auth", "neon-postgres"])
  expect(skill?.detectionSource).toBe("fallback")
})

test("presetToExtras mixes registry refs and raw entries, de-duped", () => {
  const extras = presetToExtras({
    mcp: ["context7", "https://mcp.sentry.dev/mcp", "context7"],
    skills: ["shadcn", "owner/repo#a"],
  })
  expect(extras.servers.map((s) => s.name).sort()).toEqual(["context7", "sentry"])
  expect(extras.skills.map((s) => s.source).sort()).toEqual(["owner/repo", "shadcn/ui"])
})

test("isRawMcpTarget distinguishes registry keys from raw targets", () => {
  expect(isRawMcpTarget("context7")).toBe(false)
  expect(isRawMcpTarget("shadcn")).toBe(false)
  expect(isRawMcpTarget("https://mcp.sentry.dev/mcp")).toBe(true)
  expect(isRawMcpTarget("npx -y some-mcp")).toBe(true)
  expect(isRawMcpTarget("@scope/pkg")).toBe(true)
})

test("parseRawSkill splits source from explicit skills, null for bare names", () => {
  expect(parseRawSkill("shadcn")).toBeNull()
  expect(parseRawSkill("owner/repo#a,b")).toEqual({ source: "owner/repo", names: ["a", "b"] })
  // No "#": a source with no explicit skills (validateConfig flags this).
  expect(parseRawSkill("owner/repo")).toEqual({ source: "owner/repo", names: [] })
})
