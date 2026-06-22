import type { SkillDetectionSource } from "./types"

type SkillDetectionSourceEntry = {
  resolvedSkills: string[]
  resolvedSkillPaths: string[]
  detectionSource?: SkillDetectionSource
}

const skillDetectionSourceIcons = {
  github: "◆",
  fallback: "◇",
  local: "▣",
} satisfies Record<SkillDetectionSource, string>

const skillDetectionSourceLabels = {
  github: "detected by GitHub",
  fallback: "detected by fallback list",
  local: "detected in node_modules",
} satisfies Record<SkillDetectionSource, string>

export function getSkillDetectionSource(skill: SkillDetectionSourceEntry): SkillDetectionSource {
  if (skill.detectionSource) return skill.detectionSource

  const hasGithubSkillPaths = skill.resolvedSkillPaths.some(
    (skillPath, index) => skillPath !== skill.resolvedSkills[index],
  )

  return hasGithubSkillPaths ? "github" : "fallback"
}

export function getSkillDetectionSourceIcon(skill: SkillDetectionSourceEntry): string {
  return skillDetectionSourceIcons[getSkillDetectionSource(skill)]
}

export function getSkillDetectionSourceLabel(skill: SkillDetectionSourceEntry): string {
  return skillDetectionSourceLabels[getSkillDetectionSource(skill)]
}

export function getSkillDetectionSourceHint(skill: SkillDetectionSourceEntry): string {
  return `${getSkillDetectionSourceIcon(skill)} ${getSkillDetectionSourceLabel(skill)}`
}

export function getSkillDetectionSourceKey(): string {
  // Derived from the icon/label records so new sources (e.g. "local") show up
  // in the legend automatically.
  return (Object.keys(skillDetectionSourceIcons) as Array<SkillDetectionSource>)
    .map((source) => `${skillDetectionSourceIcons[source]} ${skillDetectionSourceLabels[source]}`)
    .join(", ")
}
