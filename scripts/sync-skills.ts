/**
 * Checks if existing skills in the registry have changed upstream on skills.sh.
 * Read-only — reports diffs but does not modify any files.
 *
 * Usage: bun run scripts/sync-skills.ts
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { OFFICIAL_ORGS } from "../src/registry/orgs"

const SKILLS_REGISTRY_PATH = resolve(import.meta.dirname ?? ".", "../src/registry/skills.ts")
const SKILLS_API_BASE = "https://skills.sh"

type ApiSkill = {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}

type ApiSearchResponse = {
  skills: ApiSkill[]
  count: number
}

type ExistingSkillEntry = {
  source: string
  label: string
  skills: string[]
  conditionalSkills?: {
    when: { deps: string[] }
    skills: string[]
  }[]
  when: { deps: string[] }
}

// -- Fetch all skills for a given org from the search API --
async function fetchOrgSkills(org: string): Promise<ApiSkill[]> {
  const url = `${SKILLS_API_BASE}/api/search?q=${encodeURIComponent(org)}&limit=50`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = (await res.json()) as ApiSearchResponse
  // Filter to only skills whose source starts with this org
  return data.skills.filter((s) => s.source.startsWith(`${org}/`))
}

// -- Parse the existing skills.ts to extract current entries --
function parseExistingSkills(): ExistingSkillEntry[] {
  const content = readFileSync(SKILLS_REGISTRY_PATH, "utf-8")

  // Extract the array content between the brackets
  const match = content.match(/export const skills:\s*SkillEntry\[\]\s*=\s*\[([\s\S]*)\]/)
  if (!match?.[1]) {
    console.error("Could not parse existing skills.ts")
    return []
  }

  // Use a simpler approach: eval-like parsing via Function constructor
  // Safe here since we control the input file
  const fn = new Function(`return [${match[1]}]`)
  return fn() as ExistingSkillEntry[]
}

// -- Group API skills by source (owner/repo) --
function groupBySource(skills: ApiSkill[]): Map<string, ApiSkill[]> {
  const map = new Map<string, ApiSkill[]>()
  for (const skill of skills) {
    const existing = map.get(skill.source) ?? []
    existing.push(skill)
    map.set(skill.source, existing)
  }
  return map
}

// -- Diff helpers --
function setDiff<T>(a: Set<T>, b: Set<T>): T[] {
  return [...a].filter((x) => !b.has(x))
}

// -- Main --
async function main() {
  console.log("Checking existing skills for upstream changes...\n")

  const existingEntries = parseExistingSkills()
  if (existingEntries.length === 0) {
    console.error("No existing entries found in skills.ts")
    process.exit(1)
  }

  const allApiSkills: ApiSkill[] = []
  let fetched = 0

  for (const org of OFFICIAL_ORGS) {
    const skills = await fetchOrgSkills(org)
    allApiSkills.push(...skills)
    fetched++
    if (fetched % 10 === 0) {
      console.log(`  Fetched ${fetched}/${OFFICIAL_ORGS.length} orgs...`)
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  console.log(`Fetched ${allApiSkills.length} skills from ${OFFICIAL_ORGS.length} orgs\n`)

  const grouped = groupBySource(allApiSkills)

  type Diff = {
    source: string
    added: string[]
    removed: string[]
  }

  const diffs: Diff[] = []
  let unchanged = 0
  let notFound = 0

  for (const entry of existingEntries) {
    const apiSkills = grouped.get(entry.source)

    if (!apiSkills) {
      notFound++
      continue
    }

    const localSkills = new Set([
      ...entry.skills,
      ...(entry.conditionalSkills?.flatMap((cs) => cs.skills) ?? []),
    ])
    const remoteSkills = new Set(apiSkills.map((s) => s.name))

    const added = setDiff(remoteSkills, localSkills)
    const removed = setDiff(localSkills, remoteSkills)

    if (added.length > 0 || removed.length > 0) {
      diffs.push({ source: entry.source, added, removed })
    } else {
      unchanged++
    }
  }

  // Report
  console.log("--- Diff Report ---")
  console.log(`Checked: ${existingEntries.length} entries`)
  console.log(`Unchanged: ${unchanged}`)
  console.log(`Not found on API: ${notFound}`)
  console.log(`Changed: ${diffs.length}\n`)

  if (diffs.length === 0) {
    console.log("All existing skills are up to date.")
    return
  }

  for (const diff of diffs) {
    console.log(`${diff.source}:`)
    for (const s of diff.added) {
      console.log(`  + ${s}`)
    }
    for (const s of diff.removed) {
      console.log(`  - ${s}`)
    }
    console.log()
  }
}

main().catch(console.error)
