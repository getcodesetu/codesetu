# CodeSetu JetBrains Plugin

Kotlin/Gradle plugin for IntelliJ IDEA, PyCharm, WebStorm, GoLand, Android
Studio, and other JetBrains IDEs.

## Status

Early scaffold. Currently contributes one menu entry (`Tools → CodeSetu →
Open Chat`) that displays a placeholder dialog. The provider/chat/completions
backend that powers the VSCode extension is TypeScript and is not yet bridged
into this Kotlin plugin — see [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
for the planned daemon-based integration.

## Prerequisites

- **JDK 17+** (JDK 21 recommended). Confirm with `java -version`.
- Gradle wrapper is included — no system Gradle install needed.

## Build the plugin

```bash
cd apps/jetbrains
./gradlew buildPlugin
```

First run downloads IntelliJ Platform 2024.2.5 (~700 MB, one-time, cached in
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
