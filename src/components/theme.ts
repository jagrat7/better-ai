import pc from "picocolors"

export const theme = {
  heading: (s: string) => pc.bold(pc.cyan(s)),
  success: (s: string) => pc.green(s),
  info: (s: string) => pc.dim(pc.white(s)),
  warn: (s: string) => pc.yellow(s),
  error: (s: string) => pc.red(s),
  hint: (s: string) => pc.dim(s),
  cancelled: (s: string) => pc.red(s),
  bullet: pc.green("●"),
}
