# Contributing to CodeSetu

Thank you for your interest in contributing! CodeSetu is an open-source project and every contribution matters — code, documentation, bug reports, Indic language testing, or sharing the project.

---

## Before You Start

- Check [existing issues](../../issues) so you don't duplicate work.
- For big changes (new features, architecture changes), open a Discussion first.
- Read this document fully before submitting your first PR.

---

## Ways to Contribute

### 1. Code

- Fix a bug tagged [`bug`](../../issues?q=label:bug)
- Pick up a [`good-first-issue`](../../issues?q=label:good-first-issue)
- Implement a feature from the roadmap

### 2. Testing

- Test completions in your native Indian language (Hindi, Tamil, Telugu, Bengali, etc.) and report quality issues
- Test on-prem deployment on different hardware

### 3. Documentation

- Improve README, architecture docs, or setup guides
- Translate docs into Indian languages

### 4. Datasets & Evals

- Contribute Indic-language code completion eval prompts
- Share anonymized tool-call traces for fine-tuning (see `datasets/` folder)

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- pnpm 8+ (`npm install -g pnpm`)
- Python 3.10+ (for eval scripts)
- A configured provider — a Sarvam API key, an OpenRouter key, or a local OpenAI-compatible endpoint (Ollama, vLLM, SGLang)

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/codesetu
cd codesetu

# 2. Install dependencies
pnpm install

# 3. Set your Sarvam API key
cp .env.example .env
# Edit .env and add: SARVAM_API_KEY=your_key_here

# 4. Start dev mode
pnpm dev

# 5. Open VSCode with the extension in debug mode
# Press F5 inside VSCode to launch Extension Development Host
```

---

## Branch Naming

```
feature/short-description
fix/short-description
docs/short-description
chore/short-description
```

---

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Hindi comment support in FIM completions
fix: correct tool-call schema for the Sarvam provider
docs: add architecture diagram
chore: update pnpm lockfile
```

All commits must include a DCO sign-off:

```bash
git commit -s -m "feat: your message"
```

The `-s` flag adds `Signed-off-by: Your Name <your@email.com>` to your commit, which certifies you wrote the code and have the right to submit it under Apache 2.0.

---

## Pull Request Process

1. Keep PRs focused — one issue per PR.
2. Add tests for new functionality where applicable.
3. Ensure `pnpm lint` and `pnpm test` pass locally before pushing.
4. Fill out the PR template completely.
5. Expect a review within 48 hours. We'll always respond, even if just to acknowledge.
6. Squash commits before merge (maintainers may do this for you).

---

## Code Style

- TypeScript: ESLint + Prettier (config in repo root). Run `pnpm lint:fix`.
- Python (eval scripts): Black + isort. Run `black . && isort .`.
- No tabs — 2-space indent for TS, 4-space for Python.

---

## Reporting Bugs

Use the [Bug Report template](../../issues/new?template=bug_report.md). Include:

- OS and IDE version
- Steps to reproduce
- Expected vs actual behaviour
- Logs from the Output panel (`CodeSetu` channel)

---

## Security Issues

**Do not file public issues for security vulnerabilities.**
See [SECURITY.md](SECURITY.md) for private reporting channels (GitHub Security Advisory or Discord DM).

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).
Be respectful. Be constructive. Be kind.

---

## Questions?

- **Chat and quick help** — join our [Discord server](https://discord.gg/sjVKU8cpC6).
- **Design discussions and longer-form questions** — open a [GitHub Discussion](../../discussions).
- **Issues** are for bugs and feature requests with clear specs only.
