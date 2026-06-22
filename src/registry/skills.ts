import type { SkillEntry } from "./types"

export const skills: SkillEntry[] = [
  {
    source: "rivet-dev/skills",
    label: "Rivet",
    skills: [
      "sandbox-agent",
      "rivetkit",
      "rivetkit-client-javascript",
      "rivetkit-client-react",
      "rivetkit-typescript",
      "rivetkit-actors",
    ],
    when: { deps: ["rivetkit", "@rivet-gg/actor-client"] },
  },
]
