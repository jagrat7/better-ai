import { isCancel, outro } from "@clack/prompts"
import pc from "picocolors"

export function handleCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    outro(pc.red("Cancelled"))
    process.exit(0)
  }
  return value
}
