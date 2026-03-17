import { outro, log } from "@clack/prompts"
import pc from "picocolors"
import { detectDeps } from "../detector"
import { matchMcpServers, matchSkills } from "../matcher"
import { theme } from "../utils/theme"

type DetectInput = {
  project: string
  json?: boolean
}

export async function detect({ project, json }: DetectInput) {
  const deps = await detectDeps(project)
  const servers = matchMcpServers(deps)
  const matched = matchSkills(deps)

  if (json) {
    console.log(JSON.stringify({
      deps: [...deps],
      mcpServers: servers.map((s) => ({ key: s.key, label: s.label, name: s.name })),
      skills: matched.map((s) => ({ source: s.source, label: s.label, skills: s.resolvedSkills })),
    }, null, 2))
    return
  }


  log.info(`Found ${pc.bold(deps.size.toString())} dependencies in ${pc.dim(project)}`)

  if (servers.length > 0) {
    log.success(pc.bold("MCP Servers"))
    for (const s of servers) {
      log.message(`  ${theme.bullet} ${s.label} ${theme.hint(`(${s.name})`)}`)
    }
  }

  if (matched.length > 0) {
    log.success(pc.bold("Skills"))
    for (const s of matched) {
      log.message(`  ${theme.bullet} ${s.label} ${theme.hint(`— ${s.resolvedSkills.length} skills`)}`)
    }
  }

  if (servers.length === 0 && matched.length === 0) {
    log.warn("No matching MCP servers or skills found for this project.")
  }

  outro(pc.dim("Done"))
}
