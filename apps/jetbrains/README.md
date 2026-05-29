# CodeSetu JetBrains Plugin

Kotlin/Gradle plugin for IntelliJ IDEA, PyCharm, WebStorm, GoLand, Android
Studio, and other JetBrains IDEs.

## Features

- `Tools -> CodeSetu -> Open Chat`
- CodeSetu tool window with provider-backed chat
- Selected-code actions: Explain, Refactor, Write Tests, Fix Bug, Add Docs
- **Plan Mode** — composer toggle that asks the assistant for a numbered plan
  instead of code; one-click **Approve & Run** kicks off the implementation turn
- **AI Skills with a slash palette** — type `/` to invoke `/plan`, `/explain`,
  `/refactor`, `/test`, `/indic`. Keyword auto-routing picks the right skill
  from natural-language prompts (toggle in Settings → CodeSetu)
- **Voice (STT)** — mic button in the composer with push-to-toggle and
  push-to-talk (hold) plus a spacebar hotkey when the composer is empty.
  Default backend in JetBrains is **Sarvam Saarika** (browser
  SpeechRecognition does not work in JCEF — see "Voice in JetBrains" below).
  Other backends: OpenAI-compatible Whisper, Hugging Face Whisper. Configure
  via `Tools → CodeSetu → Setup Speech Provider` or Settings → CodeSetu →
  Speech.
- Provider settings for Sarvam and OpenAI-compatible APIs
- Provider diagnostics for missing model, failed connection, and successful connection
- Workspace skills/checks from `.codesetu/skills/*.md` and `.codesetu/checks/*.md`

## Voice in JetBrains — security trade-off

Server-side STT requires CEF flags that the plugin enables globally for the
IDE's JCEF runtime via a `JBCefAppRequiredArgumentsProvider`:

- `--enable-features=WebRTC,MediaStream,AudioServiceOutOfProcess` turns on the
  CEF media-stream subsystem so `navigator.mediaDevices.getUserMedia` resolves.
- `--use-fake-ui-for-media-stream` auto-approves the in-page mic permission
  request. The OS still gates physical mic access (you get a "Microphone
  access" prompt the first time from macOS / Windows privacy settings).

These flags apply to all JCEF webviews in the IDE, not just CodeSetu's. We
accept this because mic capture only starts when you explicitly click the
CodeSetu mic button. If your environment forbids the trade-off, you can run
voice in **browser** mode (uses webkitSpeechRecognition, no CEF flags
needed) or disable the plugin.

## Prerequisites

- **JDK 17+** (JDK 21 recommended). Confirm with `java -version`.
- Gradle wrapper is included — no system Gradle install needed.

## Build the plugin

```bash
cd apps/jetbrains
./gradlew buildPlugin
```

First run downloads IntelliJ Platform 2025.2.5 (~700 MB, one-time, cached in
`~/.gradle/caches/`), compiles the Kotlin sources, and produces a
distributable zip at `build/distributions/codesetu-jetbrains-0.1.0.zip`.

## Run the plugin in a sandbox IDE

```bash
./gradlew runIde
```

Launches a fresh IntelliJ IDEA Community instance with the plugin pre-installed,
in an isolated sandbox (separate config and plugins directories). Useful for
manual testing without affecting your main IDE config.

## Install the plugin in your own JetBrains IDE

After `buildPlugin`:

1. Open your JetBrains IDE.
2. **Settings → Plugins → ⚙ (gear icon) → Install Plugin from Disk…**
3. Select `build/distributions/codesetu-jetbrains-0.1.0.zip`.
4. Restart the IDE when prompted.

## Layout

```
apps/jetbrains/
├── build.gradle.kts          # IntelliJ Platform Gradle Plugin (2.x) config
├── settings.gradle.kts       # Project name
├── gradle.properties         # Gradle daemon + Kotlin settings
├── gradlew, gradlew.bat      # Gradle wrapper scripts
├── gradle/wrapper/           # Gradle wrapper jar + properties
└── src/main/
    ├── kotlin/ai/codesetu/   # Source code (Kotlin)
    └── resources/META-INF/
        └── plugin.xml        # Plugin descriptor — id, version, actions
```

## Why this lives in `apps/jetbrains/` (not in the pnpm graph)

JetBrains is JVM-only and uses Gradle, not pnpm. The `package.json` here is a
thin stub so the directory shows up in the pnpm workspace for tooling
consistency, but its scripts only print pointers to the Gradle commands —
`pnpm -r build` will not invoke Gradle automatically.

## Publishing (later)

Publishing to JetBrains Marketplace uses a marketplace token set via the
`JETBRAINS_MARKETPLACE_TOKEN` env var. The Gradle plugin's `publishPlugin`
task handles the upload. A GitHub Actions release workflow analogous to the
VSCode flow will be added when the plugin has real functionality.
