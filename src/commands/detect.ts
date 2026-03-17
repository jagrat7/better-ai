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

  console.error(theme.info(`Found ${deps.size} dependencies in ${project}`))
  console.error("")

  if (servers.length > 0) {
    console.log(theme.heading("MCP Servers"))
    for (const s of servers) {
      console.log(`  ${theme.bullet} ${s.label} ${theme.hint(`(${s.name})`)}`)
    }
    console.log("")
  }

  if (matched.length > 0) {
    console.log(theme.heading("Skills"))
    for (const s of matched) {
      console.log(`  ${theme.bullet} ${s.label} ${theme.hint(`— ${s.resolvedSkills.length} skills`)}`)
    }
    console.log("")
  }

  if (servers.length === 0 && matched.length === 0) {
    console.error(theme.warn("No matching MCP servers or skills found for this project."))
  }
}
