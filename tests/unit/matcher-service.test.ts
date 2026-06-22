import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { matcherService } from "../../src/services/matcher"
import * as matcherUtils from "../../src/services/matcher/utils"

afterEach(() => {
  mock.restore()
})

test("getRepoSkillPaths discovers installable paths from GitHub", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = input.toString()
    const body = url.endsWith("/git/trees/HEAD?recursive=1")
      ? {
          tree: [
            { path: "examples/ai-functions/data/island-rescue/SKILL.md", type: "blob" },
            { path: "packages/ai/skills/ai-sdk/SKILL.md", type: "blob" },
            { path: "packages/ai/skills/list-npm-package-content/SKILL.md", type: "blob" },
            { path: "packages/ai/skills/list-npm-package-content/README.md", type: "blob" },
          ],
        }
      : { tree: [] }

    return Promise.resolve(Response.json(body))
  })

  const result = await matcherUtils.getRepoSkillPaths("vercel/ai")

  expect(result).toEqual([
    "packages/ai/skills/ai-sdk",
    "packages/ai/skills/list-npm-package-content",
  ])
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})

test("matchSkills uses fetched GitHub paths when they match configured skills", async () => {
  spyOn(matcherUtils, "discoverRepoSkills").mockResolvedValue([
    { name: "ai-sdk", path: "packages/ai/skills/ai-sdk" },
    {
      name: "list-npm-package-content",
      path: "packages/ai/skills/list-npm-package-content",
    },
    { name: "unrelated-skill", path: "packages/ai/skills/unrelated-skill" },
  ])

  const result = await matcherService.matchSkills(new Set(["ai"]))

  expect(result).toHaveLength(1)
  expect(result[0]?.resolvedSkills).toEqual([
    "ai-sdk",
    "list-npm-package-content",
    "unrelated-skill",
  ])
  expect(result[0]?.resolvedSkillPaths).toEqual([
    "packages/ai/skills/ai-sdk",
    "packages/ai/skills/list-npm-package-content",
    "packages/ai/skills/unrelated-skill",
  ])
})

test("discoverLocalSkills reads nested SKILL.md, prefers frontmatter name, ignores root", async () => {
  const project = await mkdtemp(join(tmpdir(), "bttrai-local-"))
  const skillsDir = join(project, "node_modules", "acme", "skills")
  await mkdir(join(skillsDir, "use-acme"), { recursive: true })
  // Folder name differs from the declared slug — frontmatter wins.
  await writeFile(join(skillsDir, "use-acme", "SKILL.md"), "---\nname: acme-core\n---\nbody")
  // A SKILL.md in the skills/ root has no own folder → ignored.
  await writeFile(join(skillsDir, "SKILL.md"), "---\nname: stray\n---\n")

  try {
    const result = await matcherUtils.discoverLocalSkills(project, "acme")
    expect(result).toEqual([{ name: "acme-core", path: "skills/use-acme" }])
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test("discoverLocalSkills returns [] when the package ships no skills dir", async () => {
  const project = await mkdtemp(join(tmpdir(), "bttrai-local-"))
  try {
    expect(await matcherUtils.discoverLocalSkills(project, "missing")).toEqual([])
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test("matchSkills stage 0 covers local deps and skips them in the GitHub stage", async () => {
  const progress: Array<{ phase: string; total?: number }> = []
  spyOn(matcherUtils, "discoverLocalSkills").mockImplementation((_project, dep) =>
    Promise.resolve(dep === "ai" ? [{ name: "use-ai-sdk", path: "skills/use-ai-sdk" }] : []),
  )
  // Only "turbo" should reach GitHub — "ai" is resolved locally in stage 0.
  const githubFetch = spyOn(matcherUtils, "discoverRepoSkills").mockResolvedValue([])

  const result = await matcherService.matchSkills(
    new Set(["ai", "turbo"]),
    undefined,
    (event) => progress.push(event),
    false,
    "/fake/project",
  )

  // Stage 0 fired with the dep count; the local entry leads and is tagged.
  expect(progress[0]).toEqual({ phase: "local", total: 2 })
  expect(result[0]?.source).toBe("ai")
  expect(result[0]?.detectionSource).toBe("local")
  expect(result[0]?.resolvedSkillPaths).toEqual(["skills/use-ai-sdk"])
  // The GitHub tree-scan never ran for the locally-resolved "ai" repo.
  expect(githubFetch.mock.calls.flat()).not.toContain("vercel/ai")
})

test("matchSkills only falls back for sources without GitHub skills", async () => {
  const progress: Array<{ phase: "github" | "fallback"; total: number }> = []
  spyOn(matcherUtils, "discoverRepoSkills").mockImplementation((repo) =>
    Promise.resolve(
      repo === "vercel/ai" ? [{ name: "use-ai-sdk", path: "skills/use-ai-sdk" }] : [],
    ),
  )

  const result = await matcherService.matchSkills(new Set(["ai", "turbo"]), undefined, (event) =>
    progress.push(event),
  )

  expect(progress).toEqual([
    { phase: "github", total: 2 },
    { phase: "fallback", total: 1 },
  ])
  expect(result.map((skill) => skill.source)).toEqual(["vercel/ai", "vercel/turborepo"])
  expect(result[0]?.resolvedSkillPaths).toEqual(["skills/use-ai-sdk"])
  expect(result[1]?.resolvedSkillPaths).toEqual(["turborepo"])
})
