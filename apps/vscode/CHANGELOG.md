# Changelog

## 0.4.0

- **Agent Mode** — a composer toggle that turns chat into an agent: it reads, edits, and runs commands to complete a task, then you review the result. Tools include read/write/edit files, run shell commands, search (grep / glob / list), task tracking, IDE diagnostics (`get_diagnostics`), and symbol navigation (`find_symbol`, `find_references`).
- **Inline approvals** — file edits and shell commands are approved right in the chat, with a diff preview for edits; read-only tools run automatically. Approve, Approve for session, or Deny. Hit **Stop** to cancel a run mid-generation.
- **Project policy** — drop a committable `.codesetu/agent.json` to set `autoApproveCommands`, `denyCommands` (regex; deny wins), and `maxIterations` for your team.
- Works with local / self-hosted models that emit tool calls as text (Ollama, llama.cpp), not just OpenAI-style structured calls. Agent Mode is off by default and needs a tool-calling-capable model.

## 0.3.1

- "Context sent to AI" preview: a collapsible panel showing exactly what's sent to the model — the routed skill, your selected code, and the full payload.
- "Thought for Ns" thinking panel: streamed model reasoning shown above the answer, collapsing once the reply starts.
- AI Skills now load from bundled SKILL.md files (single source of truth).
- Composer: Enter sends, Shift+Enter inserts a newline; the slash palette closes once you start typing your message.

## 0.3.0

- Plan Mode: composer toggle for a numbered plan instead of code, with "Approve & Run".
- AI Skills with slash palette (`/explain`, `/refactor`, `/test`, `/indic`, `/plan`) plus keyword auto-routing.

## 0.2.0

- Store the provider API key in the OS secret store instead of settings.json.
- Add Hugging Face provider support and in-chat provider/model switching.
- Render assistant replies as markdown; refine the chat composer.

## 0.0.0

- Initial VS Code extension scaffold.
- Added chat webview flow.
- Added inline FIM completion flow.
- Added Sarvam and generic OpenAI-compatible provider support.
