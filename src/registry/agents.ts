import type { AgentOption, AgentTarget } from "./types"

export const mcpAgents: AgentOption[] = [
  { value: "antigravity", label: "Antigravity", globalOnly: true },
  { value: "cline", label: "Cline VSCode Extension", globalOnly: true },
  { value: "cline-cli", label: "Cline CLI", globalOnly: true },
  { value: "claude-code", label: "Claude Code" },
  { value: "claude-desktop", label: "Claude Desktop", globalOnly: true },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "github-copilot-cli", label: "GitHub Copilot CLI" },
  { value: "goose", label: "Goose", globalOnly: true },
  { value: "mcporter", label: "MCPorter" },
  { value: "opencode", label: "OpenCode" },
  { value: "vscode", label: "VS Code" },
  // { value: "windsurf", label: "Windsurf", globalOnly: true },
  { value: "zed", label: "Zed" },
]

export const skillAgents: AgentOption[] = [
  { value: "adal", label: "AdaL" },
  { value: "amp", label: "Amp" },
  { value: "antigravity", label: "Antigravity" },
  { value: "augment", label: "Augment" },
  { value: "bob", label: "IBM Bob" },
  { value: "claude-code", label: "Claude Code" },
  { value: "cline", label: "Cline" },
  { value: "codebuddy", label: "CodeBuddy" },
  { value: "codex", label: "Codex" },
  { value: "command-code", label: "Command Code" },
  { value: "continue", label: "Continue" },
  { value: "cortex", label: "Cortex Code" },
  { value: "crush", label: "Crush" },
  { value: "cursor", label: "Cursor" },
  { value: "deepagents", label: "Deep Agents" },
  { value: "droid", label: "Droid" },
  { value: "firebender", label: "Firebender" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "github-copilot", label: "GitHub Copilot" },
  { value: "goose", label: "Goose" },
  { value: "iflow-cli", label: "iFlow CLI" },
  { value: "junie", label: "Junie" },
  { value: "kilo", label: "Kilo Code" },
  { value: "kimi-cli", label: "Kimi Code CLI" },
  { value: "kiro-cli", label: "Kiro CLI" },
  { value: "kode", label: "Kode" },
  { value: "mcpjam", label: "MCPJam" },
  { value: "mistral-vibe", label: "Mistral Vibe" },
  { value: "mux", label: "Mux" },
  { value: "neovate", label: "Neovate" },
  { value: "openclaw", label: "OpenClaw" },
  { value: "opencode", label: "OpenCode" },
  { value: "openhands", label: "OpenHands" },
  { value: "pi", label: "Pi" },
  { value: "pochi", label: "Pochi" },
  { value: "qoder", label: "Qoder" },
  { value: "qwen-code", label: "Qwen Code" },
  { value: "roo", label: "Roo Code" },
  { value: "trae", label: "Trae" },
  { value: "trae-cn", label: "Trae CN" },
  { value: "warp", label: "Warp" },
  { value: "windsurf", label: "Windsurf" },
  { value: "zencoder", label: "Zencoder" },
]

export const defaultMcpAgents = ["cursor", "claude-code", "vscode"]
export const defaultSkillAgents = ["cursor", "claude-code", "github-copilot"]

// Canonical agents users reference in config (`agents`) and `--agent`. Each
// translates to the underlying MCP and/or skill CLI target; a missing side just
// means that CLI isn't targeted for the agent (e.g. vscode has no skills CLI).
export const agentTargets: AgentTarget[] = [
  { id: "cursor", label: "Cursor", mcp: "cursor", skills: "cursor" },
  { id: "claude-code", label: "Claude Code", mcp: "claude-code", skills: "claude-code" },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    mcp: "github-copilot-cli",
    skills: "github-copilot",
  },
  { id: "vscode", label: "VS Code", mcp: "vscode" },
]

// Known canonical names, used for config validation.
export const canonicalAgentIds = agentTargets.map((a) => a.id)

// Built-in agents used by auto mode when no agent config dirs are detected in a
// project. Replaces (never merges with) detected agents.
export const defaultAgents = [...canonicalAgentIds]

// Translate canonical agent ids into MCP and skill CLI targets. Unknown ids are
// skipped (config validation rejects them before this runs).
export function translateAgents(agents: string[]): { mcp: string[]; skill: string[] } {
  const byId = new Map(agentTargets.map((a) => [a.id, a]))
  const mcp: string[] = []
  const skill: string[] = []
  for (const id of agents) {
    const target = byId.get(id)
    if (!target) continue
    if (target.mcp) mcp.push(target.mcp)
    if (target.skills) skill.push(target.skills)
  }
  return { mcp, skill }
}
