import pc from "picocolors"
import pkg from "../../package.json"

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

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function gradientLine(line: string, r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m${line}\x1b[0m`
}

type RGB = [number, number, number]

function lerpColor(from: RGB, to: RGB, t: number): RGB {
  return [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)]
}

function renderDualLogo(): string {
  const maxBetterWidth = Math.max(...LOGO_BETTER_LINES.map((l) => l.length))
  const total = LOGO_BETTER_LINES.length - 1

  // BETTER: bright silver → dark gunmetal (metallic grey)
  const betterFrom: RGB = [200, 210, 220]
  const betterTo: RGB = [100, 110, 120]

  // AI: bright neon green → deep emerald
  const aiFrom: RGB = [0, 255, 120]
  const aiTo: RGB = [0, 160, 60]

  return LOGO_BETTER_LINES.map((line, i) => {
    const t = total === 0 ? 0 : i / total
    const [br, bg, bb] = lerpColor(betterFrom, betterTo, t)
    const [ar, ag, ab] = lerpColor(aiFrom, aiTo, t)
    const betterPart = gradientLine(line.padEnd(maxBetterWidth), br, bg, bb)
    const aiPart = gradientLine(`  ${LOGO_AI_LINES[i] ?? ""}`, ar, ag, ab)
    return `${betterPart}${aiPart}`
  }).join("\n")
}

export function renderHeader(): string {
  const terminalWidth = process.stdout.columns ?? 80
  const maxBetterWidth = Math.max(...LOGO_BETTER_LINES.map((l) => l.length))
  const maxAiWidth = Math.max(...LOGO_AI_LINES.map((l) => l.length))
  const logoWidth = maxBetterWidth + 2 + maxAiWidth

  const title = terminalWidth >= logoWidth
    ? renderDualLogo()
    : pc.bold(pc.cyan(SIMPLE))
  const subtitle = pc.dim(`  v${pkg.version} — ${pkg.description}`)

  return `${title}\n${subtitle}\n`
}
