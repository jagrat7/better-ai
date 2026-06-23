import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { configService } from "../../src/services/config"
import { detectService } from "../../src/services/detect"
import { PresetInstallService } from "../../src/services/install/preset-install"

// Hermetic config: a missing file makes auto mode fall back to built-in defaults.
process.env.BTTRAI_CONFIG = "/nonexistent/bttrai-preset-install-test/config.json"

afterEach(() => {
  mock.restore()
})

test("run installs a preset's extras without ever detecting the stack", async () => {
  const service = new PresetInstallService()
  const detectSpy = spyOn(detectService, "run")
  spyOn(service as never, "resolveInstallAgents").mockResolvedValue({
    mcp: ["cursor"],
    skill: ["cursor"],
  })
  spyOn(configService, "resolvePreset").mockResolvedValue({
    mcp: ["context7"],
    skills: ["ai-sdk"],
  })

  const result = await service.run({
    project: "/tmp/project",
    auto: true,
    preset: "frontend",
  })

  // Detection is never invoked — presets are detection-free.
  expect(detectSpy).not.toHaveBeenCalled()
  expect(result.selectedServers.map((s) => s.key)).toEqual(["context7"])
  expect(result.selectedSkills.map((s) => s.source)).toEqual(["vercel/ai"])
})

test("run resolves raw mcp targets and raw skill sources from the preset", async () => {
  const service = new PresetInstallService()
  spyOn(service as never, "resolveInstallAgents").mockResolvedValue({
    mcp: ["cursor"],
    skill: ["cursor"],
  })
  spyOn(configService, "resolvePreset").mockResolvedValue({
    mcp: ["https://mcp.sentry.dev/mcp"],
    skills: ["neondatabase/agent-skills#neon-auth"],
  })

  const result = await service.run({
    project: "/tmp/project",
    auto: true,
    preset: "ops",
  })

  expect(result.selectedServers.map((s) => s.name)).toEqual(["sentry"])
  const skill = result.selectedSkills[0]
  expect(skill?.source).toBe("neondatabase/agent-skills")
  expect(skill?.resolvedSkills).toEqual(["neon-auth"])
})
