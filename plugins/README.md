# CodeSetu Plugins

First-party plugins live here. Each plugin is a separate workspace package that
depends on `@codesetu/plugin-sdk` and exports a `CodeSetuPlugin`.

## Layout

```
plugins/
└── <plugin-name>/
    ├── package.json     # name, version, "codesetu" field with PluginManifest
    ├── src/index.ts     # exports default CodeSetuPlugin
    └── README.md
```

## Minimal plugin

`plugins/hello/package.json`:

```json
{
  "name": "@codesetu/plugin-hello",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "codesetu": {
    "id": "@codesetu/plugin-hello",
    "displayName": "Hello",
    "version": "0.0.0",
    "sdkRange": "^0.1"
  },
  "dependencies": {
    "@codesetu/plugin-sdk": "workspace:*"
  }
}
```

`plugins/hello/src/index.ts`:

```ts
import type { CodeSetuPlugin } from "@codesetu/plugin-sdk";

const plugin: CodeSetuPlugin = {
  activate(ctx) {
    ctx.host.logger.info("hello plugin activated");
  },
};

export default plugin;
```

## What plugins can register

Via the `PluginContext` passed to `activate`:

- **Tools** — `ctx.registerTool(tool)` adds a callable tool the model can invoke.
- **Providers** — `ctx.registerProvider(id, factory)` adds a new LLM provider id.
- **Skills** — `ctx.registerSkill(manifest)` adds an in-memory skill (alternative
  to dropping a SKILL.md in `/skills`).

## Host compatibility

The `hosts` field in `PluginManifest` declares which hosts the plugin supports
(`vscode`, `jetbrains`, `cli`, `web`). Omit to allow all. Hosts skip plugins
they're incompatible with rather than failing.

## Third-party plugins

External plugins are npm packages following the same shape — they don't need
to live in this repo. A user installs them and the host's plugin loader picks
them up from `node_modules` (mechanism TBD).
