import { isCancel, outro } from "@clack/prompts"
import { theme } from "./theme"

export function handleCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    outro(theme.cancelled("Cancelled"))
    process.exit(0)
  }
  return value
}
