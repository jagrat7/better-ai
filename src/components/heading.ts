import pc from "picocolors"

type RGB = [number, number, number]

const HEADING_GRADIENT: [RGB, RGB] = [
  [0, 255, 120],
  [0, 200, 90],
]

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function colorChar(char: string, color: RGB): string {
  return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m${char}\x1b[0m`
}

function gradientText(text: string, from: RGB, to: RGB): string {
  const len = text.length - 1 || 1
  return [...text]
    .map((ch, i) => {
      const t = i / len
      const r = lerp(from[0], to[0], t)
      const g = lerp(from[1], to[1], t)
      const b = lerp(from[2], to[2], t)
      return colorChar(ch, [r, g, b])
    })
    .join("")
}

export function renderHeading(text: string): string {
  const line = pc.dim("─".repeat(text.length + 4))
  const styled = pc.bold(gradientText(text, HEADING_GRADIENT[0], HEADING_GRADIENT[1]))
  return `${line}\n  ${styled}\n${line}`
}
