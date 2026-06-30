/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Minimal in-memory stand-in for the `vscode` module, just enough to run the
 * extension's `activate()` headlessly in a unit test (no Electron, no GUI). The
 * vitest config aliases "vscode" to this file. It records what the extension
 * registers (commands, content-provider schemes, inline-completion providers)
 * so the activation test can assert the wiring.
 */

function disposable(): { dispose(): void } {
  return { dispose: () => undefined };
}

export const registeredCommands: string[] = [];
export const registeredContentSchemes: string[] = [];
export let inlineCompletionProviderCount = 0;

/** Reset the recording state between tests. */
export function __reset(): void {
  registeredCommands.length = 0;
  registeredContentSchemes.length = 0;
  inlineCompletionProviderCount = 0;
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ViewColumn = { One: 1, Two: 2, Three: 3, Beside: -2 } as const;
export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const;

export const window = {
  createOutputChannel(name: string) {
    return {
      name,
      appendLine: () => undefined,
      append: () => undefined,
      show: () => undefined,
      dispose: () => undefined,
    };
  },
  createStatusBarItem() {
    return {
      text: "",
      tooltip: "",
      command: "",
      show: () => undefined,
      hide: () => undefined,
      dispose: () => undefined,
    };
  },
  registerTreeDataProvider: () => disposable(),
  onDidChangeActiveTextEditor: () => disposable(),
  activeTextEditor: undefined as unknown,
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  withProgress: async <T>(_options: unknown, task: () => Promise<T>): Promise<T> => task(),
};

export const commands = {
  registerCommand(name: string, _callback: (...args: unknown[]) => unknown) {
    registeredCommands.push(name);
    return disposable();
  },
  executeCommand: async () => undefined,
};

export const languages = {
  registerInlineCompletionItemProvider() {
    inlineCompletionProviderCount += 1;
    return disposable();
  },
};

const configuration = {
  get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
  update: async () => undefined,
  inspect: () => undefined,
};

export const workspace = {
  getConfiguration: () => configuration,
  registerTextDocumentContentProvider(scheme: string) {
    registeredContentSchemes.push(scheme);
    return disposable();
  },
  onDidChangeConfiguration: () => disposable(),
  onDidSaveTextDocument: () => disposable(),
  workspaceFolders: undefined as unknown,
  asRelativePath: (value: unknown) => String(value),
  getWorkspaceFolder: () => undefined,
  findFiles: async () => [],
  fs: {
    readFile: async () => {
      throw new Error("mock vscode: no filesystem");
    },
  },
};

export const Uri = {
  joinPath: (base: { path?: string }, ...parts: string[]) =>
    makeUri([base.path ?? "", ...parts].join("/")),
  from: (components: { scheme?: string; path?: string }) =>
    makeUri(`${components.scheme ?? "file"}:${components.path ?? ""}`),
  parse: (value: string) => makeUri(value),
  file: (value: string) => makeUri(value),
};

function makeUri(path: string): {
  path: string;
  fsPath: string;
  scheme: string;
  toString(): string;
} {
  return { path, fsPath: path, scheme: "file", toString: () => path };
}

export class EventEmitter<T> {
  public readonly event = (_listener: (value: T) => void): { dispose(): void } => disposable();
  public fire(): void {
    return undefined;
  }
  public dispose(): void {
    return undefined;
  }
}

export class Range {
  public constructor(
    public readonly startLine: number,
    public readonly startCharacter: number,
    public readonly endLine?: number,
    public readonly endCharacter?: number,
  ) {}
}
