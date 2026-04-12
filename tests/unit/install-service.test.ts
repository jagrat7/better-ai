import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { detectService } from "../../src/services/detector/detect"
import { InstallService } from "../../src/services/install/install"

afterEach(() => {
  mock.restore()
})

const detectedResult = {
  project: "/tmp/project",
  deps: new Set(["next", "ai", "better-auth"]),
  servers: [
    {
      key: "context7",
      label: "Context7",
      name: "context7",
      target: "@upstash/context7-mcp",
      when: { deps: ["*"] },
    },
  ],
  matched: [
    {
      source: "vercel/ai",
      label: "Vercel AI SDK",
      skills: ["ai-sdk"],
      when: { deps: ["ai"] },
      resolvedSkills: ["ai-sdk"],
      installed: false,
    },
  ],
}

test("run errors when auto mode has no agent", async () => {
  const service = new InstallService()
  spyOn(detectService, "run").mockResolvedValue(detectedResult)
  spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit:${code ?? 0}`)
  }) as never)

  await expect(service.run({ project: detectedResult.project, auto: true })).rejects.toThrow("exit:1")
})

test("run passes only skills to prompt in skills-only scope", async () => {
  const service = new InstallService()
  spyOn(detectService, "run").mockResolvedValue(detectedResult)
  const promptSpy = spyOn(service as never, "promptForSelection").mockResolvedValue({
    selectedServers: [],
    selectedSkills: detectedResult.matched,
    selectedMcpAgents: [],
    selectedSkillAgents: ["cursor"],
  })

  const result = await service.run({ project: detectedResult.project, skills: true })
  const promptInput = promptSpy.mock.calls[0]?.[0] as typeof detectedResult | undefined

  expect(promptInput).toBeDefined()
  if (!promptInput) {
    throw new Error("Expected prompt input")
  }

  expect(promptInput.servers).toEqual([])
  expect(promptInput.matched).toEqual(detectedResult.matched)
  expect(result.scope).toBe("skills")
  expect(result.selectedServers).toEqual([])
})

test("run passes only MCP servers to prompt in mcp-only scope", async () => {
  const service = new InstallService()
  spyOn(detectService, "run").mockResolvedValue(detectedResult)
  const promptSpy = spyOn(service as never, "promptForSelection").mockResolvedValue({
    selectedServers: detectedResult.servers,
    selectedSkills: [],
    selectedMcpAgents: ["cursor"],
    selectedSkillAgents: [],
  })

  const result = await service.run({ project: detectedResult.project, mcp: true })
  const promptInput = promptSpy.mock.calls[0]?.[0] as typeof detectedResult | undefined

  expect(promptInput).toBeDefined()
  if (!promptInput) {
    throw new Error("Expected prompt input")
  }

  expect(promptInput.servers).toEqual(detectedResult.servers)
  expect(promptInput.matched).toEqual([])
  expect(result.scope).toBe("mcp")
  expect(result.selectedSkills).toEqual([])
})

test("run returns empty selections when prompt is cancelled", async () => {
  const service = new InstallService()
  spyOn(detectService, "run").mockResolvedValue(detectedResult)
  spyOn(service as never, "promptForSelection").mockResolvedValue(null)

  const result = await service.run({ project: detectedResult.project })

  expect(result.selectedServers).toEqual([])
  expect(result.selectedSkills).toEqual([])
  expect(result.selectedMcpAgents).toEqual([])
  expect(result.selectedSkillAgents).toEqual([])
  expect(result.scope).toBe("all")
})

test("run in auto mode uses resolved agents and skips prompt flow", async () => {
  const service = new InstallService()
  spyOn(detectService, "run").mockResolvedValue(detectedResult)
  spyOn(service as never, "resolveAgents").mockResolvedValue({
    mcp: ["cursor"],
    skill: ["cursor"],
  })
  const promptSpy = spyOn(service as never, "promptForSelection")

  const result = await service.run({
    project: detectedResult.project,
    auto: true,
    agent: ["cursor"],
  })

  expect(promptSpy).not.toHaveBeenCalled()
  expect(result.selectedServers).toEqual(detectedResult.servers)
  expect(result.selectedSkills).toEqual(detectedResult.matched)
  expect(result.selectedMcpAgents).toEqual(["cursor"])
  expect(result.selectedSkillAgents).toEqual(["cursor"])
})
