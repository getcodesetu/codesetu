/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { HostKind } from "./index.js";

/**
 * What the embedding host (VSCode, JetBrains, CLI) exposes to plugins.
 * Each capability is optional so plugins can degrade gracefully across hosts.
 */
export interface HostCapabilities {
  readonly kind: HostKind;
  readonly version: string;
  readonly workspace?: WorkspaceCapability;
  readonly ui?: UiCapability;
  readonly secrets?: SecretsCapability;
  readonly logger: Logger;
}

export interface WorkspaceCapability {
  /** Absolute path to the workspace root, or undefined for ad-hoc sessions. */
  rootPath(): string | undefined;
  /** Read a text file relative to the workspace root. Hosts enforce sandboxing. */
  readTextFile(relativePath: string): Promise<string>;
  /** List paths matching a glob (host-dependent glob support). */
  glob(pattern: string): Promise<readonly string[]>;
}

export interface UiCapability {
  showInformation(message: string): void;
  showWarning(message: string): void;
  showError(message: string): void;
}

export interface SecretsCapability {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
