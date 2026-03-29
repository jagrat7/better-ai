import pkg from "../../package.json"
import { theme } from "./theme"

const LOGO_BETTER_LINES = [
  "  ██████╗ ███████╗████████╗████████╗███████╗██████╗ ",
  "  ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗",
  "  ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝",
  "  ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗",
  "  ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║",
  "  ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝",
]

const LOGO_AI_LINES = [
  " █████╗ ██╗",
  "██╔══██╗██║",
  "███████║██║",
  "██╔══██║██║",
  "██║  ██║██║",
  "╚═╝  ╚═╝╚═╝",
]

const SIMPLE = "better-ai"

type RGB = [number, number, number]

const MAX_BETTER_WIDTH = Math.max(...LOGO_BETTER_LINES.map((l) => l.length))
const MAX_AI_WIDTH = Math.max(...LOGO_AI_LINES.map((l) => l.length))
const LOGO_WIDTH = MAX_BETTER_WIDTH + 2 + MAX_AI_WIDTH
const BETTER_GRADIENT: [RGB, RGB] = [[200, 210, 220], [100, 110, 120]]
const AI_GRADIENT: [RGB, RGB] = [[0, 255, 120], [0, 160, 60]]

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function gradientLine(line: string, [r, g, b]: RGB): string {
  return `\x1b[38;2;${r};${g};${b}m${line}\x1b[0m`
}

function lerpColor(from: RGB, to: RGB, t: number): RGB {
  return [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)]
}

function renderDualLogo(): string {
  const total = LOGO_BETTER_LINES.length - 1
  return LOGO_BETTER_LINES.map((line, i) => {
    const t = i / total
    const betterPart = gradientLine(line.padEnd(MAX_BETTER_WIDTH), lerpColor(BETTER_GRADIENT[0], BETTER_GRADIENT[1], t))
    const aiPart = gradientLine(`  ${LOGO_AI_LINES[i] ?? ""}`, lerpColor(AI_GRADIENT[0], AI_GRADIENT[1], t))
    return `${betterPart}${aiPart}`
  }).join("\n")
}

export function renderHeader(): string {
  const terminalWidth = process.stdout.columns ?? 80

  const title = terminalWidth >= LOGO_WIDTH
    ? renderDualLogo()
    : theme.heading(SIMPLE)
  const subtitle = theme.hint(`  v${pkg.version} — ${pkg.description}`)

  return `${title}\n${subtitle}\n`
}
