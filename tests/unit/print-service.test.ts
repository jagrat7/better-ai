import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { printService } from "../../src/services/print"
import * as matcherUtils from "../../src/services/matcher/utils"

afterEach(() => {
  mock.restore()
})

const RAW_PREFIX = "https://raw.githubusercontent.com/vercel/ai/HEAD/"

// Mock GitHub: one recursive tree call (drives skill discovery) + raw file
// fetches keyed by repo path.
function mockGithub(tree: Array<{ path: string; type: string }>, files: Record<string, string>) {
  return spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = input.toString()
    if (url.endsWith("/git/trees/HEAD?recursive=1")) {
      return Promise.resolve(Response.json({ tree }))
    }
    if (url.startsWith(RAW_PREFIX)) {
      const content = files[url.slice(RAW_PREFIX.length)]
      return Promise.resolve(
        content === undefined ? new Response("missing", { status: 404 }) : new Response(content),
      )
    }
    return Promise.resolve(new Response("nope", { status: 404 }))
  })
}

const tree = [
  { path: "packages/ai/skills/ai-sdk/SKILL.md", type: "blob" },
  { path: "packages/ai/skills/ai-sdk/references/common-errors.md", type: "blob" },
  { path: "packages/ai/skills/other/SKILL.md", type: "blob" },
]

const files = {
  "packages/ai/skills/ai-sdk/SKILL.md": "---\nname: ai-sdk\n---\nthe instructions",
  "packages/ai/skills/ai-sdk/references/common-errors.md": "# errors\nbody",
  "packages/ai/skills/other/SKILL.md": "---\nname: other-skill\n---\n",
}

test("print returns the skill's SKILL.md by default", async () => {
  mockGithub(tree, files)

  const result = await printService.run({ source: "vercel/ai", skill: "ai-sdk" })

  expect(result).toEqual({
    source: "vercel/ai",
    skill: "ai-sdk",
    path: "SKILL.md",
    content: "---\nname: ai-sdk\n---\nthe instructions",
  })
})

test("print returns a specific reference file when one is requested", async () => {
  mockGithub(tree, files)

  const result = await printService.run({
    source: "vercel/ai",
    skill: "ai-sdk",
    file: "references/common-errors.md",
  })

  expect(result.path).toBe("references/common-errors.md")
  expect(result.content).toBe("# errors\nbody")
})

test("print matches by frontmatter name when the folder differs", async () => {
  // Folder is `use-ai-sdk` but the skill declares `name: ai-sdk`.
  mockGithub([{ path: "skills/use-ai-sdk/SKILL.md", type: "blob" }], {
    "skills/use-ai-sdk/SKILL.md": "---\nname: ai-sdk\n---\nbody",
  })

  const result = await printService.run({ source: "vercel/ai", skill: "ai-sdk" })

  expect(result.path).toBe("SKILL.md")
  expect(result.content).toBe("---\nname: ai-sdk\n---\nbody")
})

test("print throws with the available skills when the name is unknown", async () => {
  mockGithub(tree, files)

  await expect(printService.run({ source: "vercel/ai", skill: "nope" })).rejects.toThrow(
    /not found in vercel\/ai.*ai-sdk.*other-skill/,
  )
})

test("print throws when the requested file does not exist in the skill", async () => {
  mockGithub(tree, files)

  await expect(
    printService.run({ source: "vercel/ai", skill: "ai-sdk", file: "references/missing.md" }),
  ).rejects.toThrow(/File "references\/missing.md" not found/)
})

test("fetchRawFile returns text on 200 and null on 404", async () => {
  mockGithub(tree, files)

  expect(await matcherUtils.fetchRawFile("vercel/ai", "packages/ai/skills/ai-sdk/SKILL.md")).toBe(
    "---\nname: ai-sdk\n---\nthe instructions",
  )
  expect(await matcherUtils.fetchRawFile("vercel/ai", "does/not/exist.md")).toBeNull()
})
