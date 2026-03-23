import { cancel, isCancel } from "@clack/prompts"

export async function promptWithCancel<T>(prompt: () => Promise<T | symbol>): Promise<T | null> {
  const selection = await prompt()

  if (isCancel(selection)) {
    cancel("Selection cancelled")
    return null
  }

  return selection
}
