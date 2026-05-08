import type { WhenCondition } from "../../registry/types"

export function matches(when: WhenCondition, deps: Set<string>): boolean {
  return when.deps.includes("*") || when.deps.some((d) => deps.has(d))
}
