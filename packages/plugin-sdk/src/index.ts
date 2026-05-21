/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { CodeSetuTool, LlmProvider } from "@codesetu/core";

import type { HostCapabilities } from "./host.js";
import type { SkillManifest } from "./skill.js";

export type {
  HostCapabilities,
  Logger,
  SecretsCapability,
  UiCapability,
  WorkspaceCapability,
} from "./host.js";
export type { SkillManifest } from "./skill.js";

/**
 * Static plugin metadata declared in plugin.json or package.json under "codesetu".
 * Loaded before the plugin module is executed so the host can decide whether to
 * activate it.
 */
export interface PluginManifest {
  /** Unique plugin id, e.g. "@codesetu/git-tools" or "acme.review-helper". */
  id: string;
  /** Display name shown in plugin lists. */
  displayName: string;
  /** Semver of the plugin itself (not the SDK). */
  version: string;
  /** Compatible SDK semver range, e.g. "^0.1". Host refuses to load incompatible plugins. */
  sdkRange: string;
  /** Host kinds this plugin supports. Omit to allow all hosts. */
  hosts?: readonly HostKind[];
  /** Optional one-line summary surfaced in UI. */
  description?: string;
}

/**
 * Capabilities surface passed to a plugin's activate() hook. Plugins call these
 * to register tools, providers, and skills with the host. Hosts decide which
 * registrations to honor based on user trust settings.
 */
export interface PluginContext {
  readonly host: HostCapabilities;
  registerTool(tool: CodeSetuTool): void;
  registerProvider(id: string, factory: () => LlmProvider): void;
  registerSkill(skill: SkillManifest): void;
  /** Subscribe to a graceful shutdown signal from the host. */
  onDeactivate(handler: () => void | Promise<void>): void;
}

/**
 * Runtime contract a plugin module must export as default or as `plugin`.
 * activate() runs once after manifest validation; deactivate runs on host shutdown
 * or plugin disable.
 */
export interface CodeSetuPlugin {
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

/** Host kinds a plugin can target. */
export type HostKind = "vscode" | "jetbrains" | "cli" | "web";
