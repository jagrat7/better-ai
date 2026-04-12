import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export function createTempDir() {
  return mkdtempSync(join(tmpdir(), "better-ai-test-"))
}

export function removeTempDir(path: string) {
  rmSync(path, { recursive: true, force: true })
}
