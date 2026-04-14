/**
 * Checks if local agent lists are in sync with upstream CLIs (add-mcp + skills).
 * Read-only — reports diffs but does not modify any files.
 *
 * Usage: bun run scripts/sync-agents.ts
 */

import { readFileSync } from "fs"
import { resolve } from "path"

const AGENTS_REGISTRY_PATH = resolve(import.meta.dirname ?? ".", "../src/registry/agents.ts")

const ADD_MCP_TYPES_URL = "https://raw.githubusercontent.com/neondatabase/add-mcp/main/src/types.ts"
const ADD_MCP_AGENTS_URL =
  "https://raw.githubusercontent.com/neondatabase/add-mcp/main/src/agents.ts"
const SKILLS_AGENTS_URL = "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts"

type AgentEntry = { value: string; label: string }

// -- Fetch helpers --

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.text()
}

// -- Parse upstream add-mcp agents --

async function fetchAddMcpAgents(): Promise<AgentEntry[]> {
  const [typesSource, agentsSource] = await Promise.all([
    fetchText(ADD_MCP_TYPES_URL),
    fetchText(ADD_MCP_AGENTS_URL),
  ])

  // Extract agent keys from the AgentType union only
  const agentTypeBlock = typesSource.match(/export type AgentType\s*=([\s\S]*?);/)
  if (!agentTypeBlock?.[1]) throw new Error("Could not find AgentType union in add-mcp types.ts")
  const typeMatches = agentTypeBlock[1].matchAll(/\|\s*["']([^"']+)["']/g)
  const agentKeys = [...typeMatches].map((m) => m[1]!)

  // Extract aliases to exclude them
  const aliasBlock = typesSource.match(/agentAliases[^{]*\{([^}]+)\}/)
  const aliasKeys = new Set<string>()
  if (aliasBlock?.[1]) {
    const aliasMatches = aliasBlock[1].matchAll(/["']([^"']+)["']\s*:/g)
    for (const m of aliasMatches) {
      aliasKeys.add(m[1]!)
    }
  }

  // Extract displayNames from agents record
  const displayNameMap = new Map<string, string>()
  const dnMatches = agentsSource.matchAll(
    /["']?(\w[\w-]*)["']?\s*:\s*\{[^}]*displayName:\s*["']([^"']+)["']/g,
  )
  for (const m of dnMatches) {
    displayNameMap.set(m[1]!, m[2]!)
  }

  return agentKeys
    .filter((key) => !aliasKeys.has(key))
    .map((key) => ({
      value: key,
      label: displayNameMap.get(key) ?? key,
    }))
}

// -- Parse upstream skills agents --

async function fetchSkillsAgents(): Promise<AgentEntry[]> {
  const source = await fetchText(SKILLS_AGENTS_URL)

  // Extract agent record entries: key { ... displayName: '...' ... showInUniversalList?: false }
  const entries: AgentEntry[] = []
  const blockPattern = /['"]?([\w-]+)['"]?\s*:\s*\{([^}]+)\}/g

  for (const match of source.matchAll(blockPattern)) {
    const key = match[1]!
    const body = match[2]!

    // Skip agents with showInUniversalList: false
    if (/showInUniversalList\s*:\s*false/.test(body)) continue

    const dnMatch = body.match(/displayName\s*:\s*['"]([^'"]+)['"]/)
    if (!dnMatch?.[1]) continue

    entries.push({ value: key, label: dnMatch[1] })
  }

  return entries
}

// -- Parse local registry --

function parseLocalAgents(): { mcpAgents: AgentEntry[]; skillAgents: AgentEntry[] } {
  const content = readFileSync(AGENTS_REGISTRY_PATH, "utf-8")

  const parseLine = (line: string): AgentEntry | null => {
    const m = line.match(/value:\s*["']([^"']+)["'].*label:\s*["']([^"']+)["']/)
    if (!m?.[1] || !m?.[2]) return null
    return { value: m[1], label: m[2] }
  }

  const extractArray = (name: string): AgentEntry[] => {
    const pattern = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`)
    const match = content.match(pattern)
    if (!match?.[1]) return []
    return match[1].split("\n").map(parseLine).filter(Boolean) as AgentEntry[]
  }

  return {
    mcpAgents: extractArray("mcpAgents"),
    skillAgents: extractArray("skillAgents"),
  }
}

// -- Diff --

function diffAgents(
  local: AgentEntry[],
  remote: AgentEntry[],
): { added: AgentEntry[]; removed: AgentEntry[] } {
  const localKeys = new Set(local.map((a) => a.value))
  const remoteKeys = new Set(remote.map((a) => a.value))

  const added = remote.filter((a) => !localKeys.has(a.value))
  const removed = local.filter((a) => !remoteKeys.has(a.value))

  return { added, removed }
}

// -- Main --

async function main() {
  console.log("Checking agent lists against upstream CLIs...\n")

  const local = parseLocalAgents()
  console.log(
    `Local: ${local.mcpAgents.length} MCP agents, ${local.skillAgents.length} skill agents\n`,
  )

  // Fetch upstream
  const [remoteMcp, remoteSkills] = await Promise.all([fetchAddMcpAgents(), fetchSkillsAgents()])

  console.log(
    `Upstream: ${remoteMcp.length} add-mcp agents, ${remoteSkills.length} skills agents\n`,
  )

  // Diff MCP agents
  const mcpDiff = diffAgents(local.mcpAgents, remoteMcp)
  // Diff skill agents
  const skillsDiff = diffAgents(local.skillAgents, remoteSkills)

  // Report
  console.log("--- MCP Agents (add-mcp) ---")
  if (mcpDiff.added.length === 0 && mcpDiff.removed.length === 0) {
    console.log("In sync.\n")
  } else {
    for (const a of mcpDiff.added) console.log(`  + ${a.value} (${a.label})`)
    for (const a of mcpDiff.removed) console.log(`  - ${a.value} (${a.label})`)
    console.log()
  }

  console.log("--- Skill Agents (skills) ---")
  if (skillsDiff.added.length === 0 && skillsDiff.removed.length === 0) {
    console.log("In sync.\n")
  } else {
    for (const a of skillsDiff.added) console.log(`  + ${a.value} (${a.label})`)
    for (const a of skillsDiff.removed) console.log(`  - ${a.value} (${a.label})`)
    console.log()
  }

  const totalDrift =
    mcpDiff.added.length +
    mcpDiff.removed.length +
    skillsDiff.added.length +
    skillsDiff.removed.length
  if (totalDrift === 0) {
    console.log("All agent lists are up to date.")
  } else {
    console.log(`${totalDrift} difference(s) found. Update src/registry/agents.ts to sync.`)
    process.exit(1)
  }
}

main().catch(console.error)
