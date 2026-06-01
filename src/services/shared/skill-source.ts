import type { SkillDetectionSource } from "./types"

type SkillDetectionSourceEntry = {
  resolvedSkills: string[]
  resolvedSkillPaths: string[]
  detectionSource?: SkillDetectionSource
}

const skillDetectionSourceIcons = {
  github: "◆",
  fallback: "◇",
} satisfies Record<SkillDetectionSource, string>

const skillDetectionSourceLabels = {
  github: "detected by GitHub",
  fallback: "detected by fallback list",
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
  return `${skillDetectionSourceIcons.github} ${skillDetectionSourceLabels.github}, ${skillDetectionSourceIcons.fallback} ${skillDetectionSourceLabels.fallback}`
}
