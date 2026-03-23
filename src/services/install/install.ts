import { log, multiselect, outro } from "@clack/prompts"
import pc from "picocolors"
import { detectService, type DetectInput, type DetectJson, type DetectResult } from "../detector/detect"
import { promptWithCancel } from "../utils"
import type { ServiceI } from "../service.inerface"
import { theme } from "../../components/theme"

export type InstallInput = DetectInput & {
  auto?: boolean
}

export type InstallResult = DetectResult & {
  selectedServers: DetectResult["servers"]
  selectedSkills: DetectResult["matched"]
}

export type InstallJson = DetectJson & {
  selectedMcpServers: DetectJson["mcpServers"]
  selectedSkills: DetectJson["skills"]
}

export class InstallService implements ServiceI<InstallInput, InstallResult, InstallJson> {
  async run({ auto, ...input }: InstallInput): Promise<InstallResult> {
    const detected = await detectService.run(input)

    if (auto) {
      return {
        ...detected,
        selectedServers: detected.servers,
        selectedSkills: detected.matched,
      }
    }

    const selection = await this.promptForSelection(detected)

    if (!selection) {
      return {
        ...detected,
        selectedServers: [],
        selectedSkills: [],
      }
    }

    return {
      ...detected,
      selectedServers: selection.selectedServers,
      selectedSkills: selection.selectedSkills,
    }
  }

  json(result: InstallResult): InstallJson {
    const detected = detectService.json(result)

    return {
      ...detected,
      selectedMcpServers: result.selectedServers.map((server) => ({
        key: server.key,
        label: server.label,
        name: server.name,
      })),
      selectedSkills: result.selectedSkills.map((skill) => ({
        source: skill.source,
        label: skill.label,
        skills: skill.resolvedSkills,
      })),
    }
  }

  command(result: InstallResult): void {
    log.info(`Found ${pc.bold(result.deps.size.toString())} dependencies in ${pc.dim(result.project)}`)

    if (result.selectedServers.length > 0) {
      log.success(pc.bold("Selected MCP Servers"))
      for (const server of result.selectedServers) {
        log.message(`  ${theme.bullet} ${server.label} ${theme.hint(`(${server.name})`)}`)
      }
    }

    if (result.selectedSkills.length > 0) {
      log.success(pc.bold("Selected Skills"))
      for (const skill of result.selectedSkills) {
        log.message(`  ${theme.bullet} ${skill.label} ${theme.hint(`— ${skill.resolvedSkills.length} skills`)}`)
      }
    }

    if (result.selectedServers.length === 0 && result.selectedSkills.length === 0) {
      log.warn("No MCP servers or skills selected.")
    }

    outro(pc.dim("Done"))
  }

  private async promptForSelection(result: DetectResult): Promise<Pick<InstallResult, "selectedServers" | "selectedSkills"> | null> {
    const selectedServerKeys = result.servers.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select MCP servers to install",
          options: result.servers.map((server) => ({
            value: server.key,
            label: `${server.label} (${server.name})`,
            hint: server.name,
          })),
          initialValues: result.servers.map((server) => server.key),
          required: false,
        }))
      : []

    if (!selectedServerKeys) {
      return null
    }

    const selectedSkillSources = result.matched.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select skills to install",
          options: result.matched.map((skill) => ({
            value: skill.source,
            label: skill.label,
            hint: `${skill.resolvedSkills.length} skills`,
          })),
          initialValues: result.matched.map((skill) => skill.source),
          required: false,
        }))
      : []

    if (!selectedSkillSources) {
      return null
    }

    return {
      selectedServers: result.servers.filter((server) => selectedServerKeys.includes(server.key)),
      selectedSkills: result.matched.filter((skill) => selectedSkillSources.includes(skill.source)),
    }
  }
}

export const installService = new InstallService()

export async function install(input: InstallInput & { json?: boolean }) {
  const result = await installService.run(input)

  if (input.json) {
    console.log(JSON.stringify(installService.json(result), null, 2))
    return
  }

  installService.command(result)
}
