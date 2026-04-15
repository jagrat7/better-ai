import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import pc from "picocolors"

const validModes = new Set(["run", "cpu", "heap", "flame"])
// Default iteration counts used when the CLI caller does not pass an explicit value.
const defaultIterationsByMode = {
  run: 75,
  cpu: 75,
  heap: 75,
  flame: 200,
} as const

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, "..")

// Positional CLI defaults: flow, harness, mode, and project all fall back here.
const [
  ,
  ,
  flowArg = "detect",
  harnessArg = "scripts/profile-detect.ts",
  modeArg = "flame",
  projectArg = "./bt3-cli",
  iterationsArg,
] = process.argv

const flow = toSlug(flowArg)
const harnessPath = resolve(repoRoot, harnessArg)
const mode = modeArg.toLowerCase()

if (!validModes.has(mode)) {
  throw new Error(`Invalid profile mode: ${modeArg}. Use one of: run, cpu, heap, flame`)
}

// Iterations default from `defaultIterationsByMode` when no CLI value is provided.
const iterations = Number.parseInt(
  iterationsArg ?? `${defaultIterationsByMode[mode as keyof typeof defaultIterationsByMode]}`,
  10,
)

if (!Number.isFinite(iterations) || iterations < 1) {
  throw new Error(`Iterations must be a positive integer. Received: ${iterationsArg}`)
}

const project = resolve(projectArg)
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
const projectName = basename(project)
const outputDir = resolve(repoRoot, ".profiles", flow, `${timestamp}-${mode}-${projectName}`)
const bundledHarnessPath = resolve(repoRoot, "dist", `profile-${flow}.mjs`)
const cpuProfileName = `${flow}.cpuprofile`
const heapProfileName = `${flow}.heapprofile`

await mkdir(outputDir, { recursive: true })
await writeFile(
  resolve(outputDir, "meta.json"),
  JSON.stringify(
    {
      flow,
      harness: harnessPath,
      mode,
      project,
      iterations,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  ),
)

console.error(`${pc.bold(pc.cyan("Profile flow:"))} ${pc.white(flow)}`)
console.error(`${pc.bold(pc.cyan("Harness:"))} ${pc.white(harnessArg)}`)
console.error(`${pc.bold(pc.cyan("Mode:"))} ${pc.white(mode)}`)
console.error(`${pc.bold(pc.cyan("Project:"))} ${pc.white(project)}`)
console.error(`${pc.bold(pc.cyan("Iterations:"))} ${pc.white(`${iterations}`)}`)
console.error(`${pc.bold(pc.cyan("Artifacts:"))} ${pc.green(outputDir)}`)

await runProcess("bun", ["build", harnessPath, "--outfile", bundledHarnessPath, "--target", "node"], repoRoot)

switch (mode) {
  case "run":
    await runProcess("node", [bundledHarnessPath, project, `${iterations}`], repoRoot)
    break
  case "cpu":
    await runProcess(
      "node",
      [
        "--cpu-prof",
        `--cpu-prof-dir=${outputDir}`,
        `--cpu-prof-name=${cpuProfileName}`,
        bundledHarnessPath,
        project,
        `${iterations}`,
      ],
      repoRoot,
    )
    break
  case "heap":
    await runProcess(
      "node",
      [
        "--heap-prof",
        `--heap-prof-dir=${outputDir}`,
        `--heap-prof-name=${heapProfileName}`,
        bundledHarnessPath,
        project,
        `${iterations}`,
      ],
      repoRoot,
    )
    break
  case "flame":
    await runProcess(
      "flame",
      ["run", "--delay=none", bundledHarnessPath, "--", project, `${iterations}`],
      outputDir,
    )
    break
  default:
    throw new Error(`Unhandled profile mode: ${mode}`)
}

console.error(`${pc.bold(pc.green("Done:"))} ${pc.white(outputDir)}`)

function toSlug(value: string) {
  const slug = value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "")
  return slug || "profile"
}

function runProcess(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    })

    child.on("error", rejectPromise)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(
        new Error(
          `${command} exited with ${code ?? "unknown code"}${signal ? ` (signal: ${signal})` : ""}`,
        ),
      )
    })
  })
}
