import { log, outro } from "@clack/prompts"
import pc from "picocolors"
import { detectDeps } from "./utils"
import { matchMcpServers, matchSkills, readSkillsLock } from "../matcher/matcher"
import type { ServiceI } from "../service.interface"
import { theme } from "../../components/theme"

export type DetectInput = {
  project: string
}

type DetectCommandInput = DetectInput & {
  json?: boolean
}

export type DetectResult = {
  project: string
  deps: Set<string>
  servers: ReturnType<typeof matchMcpServers>
  matched: ReturnType<typeof matchSkills>
}

export type DetectJson = {
  deps: string[]
  mcpServers: Array<{
    key: string
    label: string
    name: string
  }>
  skills: Array<{
    source: string
    label: string
    skills: string[]
  }>
}

export const detectService = {
  async run({ project }: DetectInput): Promise<DetectResult> {
    const deps = await detectDeps(project)
    const installedSkills = await readSkillsLock(project)
    const servers = matchMcpServers(deps)
    const matched = matchSkills(deps, installedSkills)

    return {
      project,
      deps,
      servers,
      matched,
    }
  },
  json(result: DetectResult): DetectJson {
    return {
      deps: [...result.deps],
      mcpServers: result.servers.map((server) => ({
        key: server.key,
        label: server.label,
        name: server.name,
      })),
      skills: result.matched.map((skill) => ({
        source: skill.source,
        label: skill.label,
        skills: skill.resolvedSkills,
      })),
    }
  },
  command(result: DetectResult): void {
    log.info(
      `Found ${pc.bold(result.deps.size.toString())} dependencies in ${pc.dim(result.project)}`,
    )

    if (result.servers.length > 0) {
      log.success(pc.bold("MCP Servers"))
      for (const server of result.servers) {
        log.message(`  ${theme.bullet} ${server.label} ${theme.hint(`(${server.name})`)}`)
      }
    }

    if (result.matched.length > 0) {
      log.success(pc.bold("Skills"))
      for (const skill of result.matched) {
        const status = skill.installed ? pc.green(" [installed]") : ""
        log.message(
          `  ${theme.bullet} ${skill.label} ${theme.hint(`— ${skill.resolvedSkills.length} skills`)}${status}`,
        )
      }
    }

    if (result.servers.length === 0 && result.matched.length === 0) {
      log.warn("No matching MCP servers or skills found for this project.")
    }

    outro(pc.dim("Done"))
  },
} satisfies ServiceI<DetectInput, DetectResult, DetectJson>

export async function detect({ json, ...input }: DetectCommandInput) {
  const result = await detectService.run(input)

  if (json) {
    console.log(JSON.stringify(detectService.json(result), null, 2))
    return
  }

  detectService.command(result)
}
