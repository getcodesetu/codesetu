# CodeSetu

CodeSetu is an AI coding assistant for VS Code with chat and inline
fill-in-the-middle completions.

## Features

- `CodeSetu: Open Chat` command
- Status bar entry
- Repo-aware chat context from the active editor and workspace snippets
- Selected-code actions: Explain, Refactor, Write Tests, Fix Bug, Add Docs
- `CodeSetu: Setup Provider` guided provider configuration
- `CodeSetu: Diagnose Provider` connection test and friendly errors
- Inline completions for code files
- Sarvam provider support
- Generic OpenAI-compatible provider support for Ollama, OpenRouter, vLLM,
  SGLang, and similar endpoints
- Workspace skills/checks from `.codesetu/skills/*.md` and `.codesetu/checks/*.md`

## Provider Settings

Open VS Code Settings JSON and configure one provider.

Sarvam (`sarvam-30b` is the default; use `sarvam-105b` if your account/workload needs it):

```json
{
  "codesetu.provider": "sarvam",
  "codesetu.apiKey": "YOUR_SARVAM_API_KEY",
  "codesetu.baseUrl": "https://api.sarvam.ai/v1",
  "codesetu.model": "sarvam-30b"
}
```

Ollama:

```json
{
  "codesetu.provider": "openai-compatible",
  "codesetu.apiKey": "ollama",
  "codesetu.baseUrl": "http://localhost:11434/v1",
  "codesetu.model": "qwen2.5-coder:7b"
}
```

OpenRouter:

```json
{
  "codesetu.provider": "openai-compatible",
  "codesetu.apiKey": "YOUR_OPENROUTER_API_KEY",
  "codesetu.baseUrl": "https://openrouter.ai/api/v1",
  "codesetu.model": "anthropic/claude-3.5-sonnet"
}
```

## Troubleshooting

Open Output and select the `CodeSetu` channel to inspect provider errors.

## License

Apache License 2.0.
