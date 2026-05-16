import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { matcherService } from "../../src/services/matcher/matcher"

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

  const result = await matcherService.getRepoSkillPaths("vercel/ai")

  expect(result).toEqual([
    "packages/ai/skills/ai-sdk",
    "packages/ai/skills/list-npm-package-content",
  ])
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})

test("matchSkills uses fetched GitHub paths when they match configured skills", async () => {
  spyOn(matcherService, "discoverRepoSkills").mockResolvedValue([
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

test("matchSkills only falls back for sources without GitHub skills", async () => {
  const progress: Array<{ phase: "github" | "fallback"; total: number }> = []
  spyOn(matcherService, "discoverRepoSkills").mockImplementation((repo) =>
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
