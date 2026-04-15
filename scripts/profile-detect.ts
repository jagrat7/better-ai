import { resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { detectService } from "../src/services/detector/detect"

const [, , projectArg = ".", iterationsArg = "75"] = process.argv
const project = resolve(projectArg)
const iterations = Number.parseInt(iterationsArg, 10)

if (!Number.isFinite(iterations) || iterations < 1) {
  throw new Error(`Iterations must be a positive integer. Received: ${iterationsArg}`)
}

let result = await detectService.run({ project })
const startedAt = performance.now()

for (let index = 0; index < iterations; index += 1) {
  result = await detectService.run({ project })
}

const elapsedMs = performance.now() - startedAt

console.log(
  JSON.stringify(
    {
      project,
      iterations,
      elapsedMs,
      avgMs: elapsedMs / iterations,
      deps: result.deps.size,
      mcpServers: result.servers.length,
      skills: result.matched.length,
    },
    null,
    2,
  ),
)
