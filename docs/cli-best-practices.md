# CLI Best Practices

A reference guide covering Unix fundamentals and modern CLI conventions. Based on [clig.dev](https://clig.dev/) (Command Line Interface Guidelines), [POSIX Utility Conventions](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html), the Unix Philosophy, and [ThePrimeagen's CLI design advice](https://www.youtube.com/watch?v=ztsOwk1zB3o).

---

## The 3 Standard Channels

Every CLI program communicates through three channels built into the operating system:

```
┌─────────────┐
│  Your CLI    │
│  Program     │
│              │
│  stdin ───>  │  <- input (piped data or file)
│  stdout <──  │  <- output (the actual result/data)
│  stderr <──  │  <- logs, errors, progress (human info)
└─────────────┘
```

- **stdin** (standard input) — where the program reads data from. Can be piped data, interactive user input, or a file path argument.
- **stdout** (standard output) — the real result of your program. This is what gets piped to the next program. Keep it clean — data only.
- **stderr** (standard error) — logs, progress spinners, warnings. Stuff for the human that should NOT pollute the data flowing through pipes.

> "Write programs to handle text streams, because that is a universal interface." — Doug McIlroy

### Why This Matters: Composability

Unix programs are small tools that chain together via pipes:

```bash
# Get data -> process in parallel -> save results
get-data | parallel my-script | tee results.txt
```

This only works if each program follows the stdin/stdout/stderr contract. If your CLI prints "Installing..." to stdout instead of stderr, it breaks every pipe.

### The `tee` Trick: Breakpoints in Pipes

`tee` saves stdin to a file AND passes it through to stdout — a "breakpoint" in your pipe:

```bash
better-ai detect ./my-app | tee detected.json | better-ai install --auto
```

This saves the detection result to `detected.json` while still piping it forward. If something breaks downstream, you don't have to re-run detection.

---

## Anatomy of a CLI Command

```
better-ai install --auto --scope project ./my-app
│         │        │       │              │
│         │        │       │              └─ positional argument
│         │        │       └─ flag with value (--key value)
│         │        └─ boolean flag (--flag = true)
│         └─ subcommand
└─ program name
```

| Concept          | What it is                                         | Example               |
| ---------------- | -------------------------------------------------- | --------------------- |
| Program name     | The binary name in `package.json` `bin` field      | `better-ai`           |
| Subcommand       | A verb/action the program can do                   | `install`, `detect`   |
| Positional arg   | Value without a `--` prefix, identified by position| `./my-app`            |
| Flag/option      | Named value with `--` prefix                       | `--scope project`     |
| Boolean flag     | Flag that is true when present                     | `--auto`              |
| Short flag       | Single-char alias with `-`                          | `-a` for `--auto`     |

---

## Unix Fundamentals (ThePrimeagen's Rules)

These come directly from the Unix philosophy and are the foundation of CLI design:

### 1. stdin as input, stdout as output

Your program should accept input from stdin (piped data) or from a file path argument. The interface should be the same — if no file is given, read from stdin.

### 2. stderr for logs and progress

All human-facing messages (progress, warnings, debug info) go to stderr. stdout is reserved for data.

### 3. File input = stdin input

Design your program so that reading from a file and reading from stdin use the same code path. This makes testing trivial and piping automatic.

### 4. Composability via pipes

Programs should be small, focused, and chainable. Output from one feeds into the next.

### 5. Golden File Testing

Since your CLI reads files/stdin and writes to stdout, testing is straightforward:

```
input.json  ->  your-cli  ->  actual-output.json
                                      ↕ compare
                              expected-output.json
```

```bash
# Run CLI with known input, compare to expected output
better-ai detect < test/fixtures/nextjs-package.json > actual.json
diff actual.json test/fixtures/expected-nextjs.json
```

No mocking needed — just files in, files out, compare.

---

## Modern CLI Conventions

These extend the Unix fundamentals for modern developer tools. Sourced from [clig.dev](https://clig.dev/) and POSIX conventions.

### 1. Exit Codes

```
Exit 0 = success
Exit 1 = general error
Exit 2 = misuse (bad flags, missing args)
```

Every script and CI pipeline depends on this. `set -e` in bash kills on non-zero. `&&` chaining relies on it:

```bash
better-ai detect && better-ai install  # install only runs if detect succeeds
```

### 2. `--help` and `--version` Are Mandatory

```bash
better-ai --help      # show usage
better-ai --version   # print version and exit
```

POSIX convention. Every CLI framework generates these automatically.

### 3. TTY Detection (Interactive vs Pipe)

```
If stdout is a terminal (TTY):
  -> show colors, spinners, interactive prompts

If stdout is a pipe (not TTY):
  -> no colors, no spinners, output clean data (JSON)
```

This is how `ls` shows columns interactively but one-per-line when piped. Interactive prompts (like `@clack/prompts`) should only show when a human is at the terminal.

### 4. Respect `NO_COLOR` and `CI` Environment Variables

```bash
NO_COLOR=1 better-ai install   # disable ANSI colors
CI=true better-ai install      # non-interactive mode, no prompts
```

Standard conventions. See [no-color.org](https://no-color.org/).

### 5. Sensible Defaults, Override with Flags

```bash
better-ai install              # detects everything, prompts for choices
better-ai install --auto       # detects everything, picks defaults
better-ai install --scope global --auto  # explicit override
```

> "Make the default behavior the useful behavior." — clig.dev

### 6. Machine-Readable Output Mode

```bash
better-ai detect ./my-app              # pretty human output
better-ai detect ./my-app --json       # structured JSON for scripts
```

Support both humans and machines. When `--json` is passed, output only valid JSON to stdout.

### 7. Confirm Before Destructive Actions

```bash
better-ai install            # "Install 5 MCP servers? (y/N)"
better-ai install --auto     # skip confirmation (user opted in)
better-ai install --dry-run  # show what would happen, do nothing
```

> "If the action is dangerous, prompt for confirmation." — clig.dev

### 8. Meaningful Error Messages

```
Bad:   Error: ENOENT
Good:  Could not find package.json in ./my-app -- are you in a project directory?
```

Include what went wrong, why, and what the user can do about it.

---

## Summary

```
Unix fundamentals:                  Modern additions:
├── stdin/stdout/stderr contract    ├── exit codes (0, 1, 2)
├── file input = stdin input        ├── --help, --version
├── composability via pipes         ├── TTY detection (interactive vs pipe)
├── tee for breakpoints             ├── NO_COLOR / CI env vars
└── golden file testing             ├── --json for machine output
                                    ├── --dry-run for safety
                                    ├── sensible defaults
                                    └── confirm destructive actions
```

## References

- [clig.dev](https://clig.dev/) — Command Line Interface Guidelines
- [POSIX Utility Conventions](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html)
- [no-color.org](https://no-color.org/)
- [The Art of Unix Programming](https://en.wikipedia.org/wiki/The_Art_of_Unix_Programming) by Eric S. Raymond
- [ThePrimeagen — CLI Design](https://www.youtube.com/watch?v=ztsOwk1zB3o)
