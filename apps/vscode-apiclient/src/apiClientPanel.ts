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

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  executeHttpRequest,
  importCollections,
  type Auth,
  type Collection,
  type CollectionNode,
  type RequestNode,
  type Variable,
  type VariableScope,
} from "@codesetu/api-client-core";
import * as vscode from "vscode";

import type {
  HostToWebview,
  ImportFormat,
  PersistedState,
  RequestDefaults,
  WebviewToHost,
} from "./protocol";
import type { ApiClientStorage } from "./storage";

interface RequestContext {
  collectionVariables: Variable[];
  inheritedAuth?: Auth;
}

export class ApiClientPanel {
  private static current: ApiClientPanel | undefined;

  private readonly inFlight = new Map<string, AbortController>();
  private state: PersistedState;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly storage: ApiClientStorage,
    private readonly outputChannel: vscode.OutputChannel,
    initialState: PersistedState,
  ) {
    this.state = initialState;
    this.panel.webview.html = this.renderHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message as WebviewToHost);
    });
    this.panel.onDidDispose(() => {
      for (const controller of this.inFlight.values()) {
        controller.abort();
      }
      this.inFlight.clear();
      ApiClientPanel.current = undefined;
    });
  }

  static async createOrShow(
    extensionUri: vscode.Uri,
    storage: ApiClientStorage,
    outputChannel: vscode.OutputChannel,
  ): Promise<ApiClientPanel> {
    if (ApiClientPanel.current) {
      ApiClientPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return ApiClientPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      "codesetuApiClient",
      "CodeSetu API Client",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
      },
    );

    const state = await storage.load();
    ApiClientPanel.current = new ApiClientPanel(panel, extensionUri, storage, outputChannel, state);
    return ApiClientPanel.current;
  }

  post(message: HostToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  triggerImport(): Promise<void> {
    return this.pickAndImportFile();
  }

  private async handleMessage(message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case "ready":
        this.post({ type: "init", state: this.state, defaults: readRequestDefaults() });
        break;
      case "persist":
        this.state = message.state;
        await this.storage.save(message.state);
        break;
      case "sendHttpRequest":
        await this.runHttpRequest(message.requestId, message.node, message.environmentId);
        break;
      case "cancelRequest": {
        this.inFlight.get(message.requestId)?.abort();
        break;
      }
      case "importText":
        this.importFromText(message.text, message.format);
        break;
      case "pickImportFile":
        await this.pickAndImportFile();
        break;
      default:
        break;
    }
  }

  private async runHttpRequest(
    requestId: string,
    node: RequestNode,
    environmentId: string | undefined,
  ): Promise<void> {
    const request = node.http;
    if (!request) {
      this.post({ type: "httpError", requestId, message: "Request has no HTTP definition." });
      return;
    }

    const controller = new AbortController();
    this.inFlight.set(requestId, controller);
    const context = findRequestContext(this.state.collections, node.id);
    const scope = this.buildScope(context, environmentId);
    const defaults = readRequestDefaults();

    try {
      const response = await executeHttpRequest(
        { ...request, settings: { ...request.settings, ...defaults } },
        {
          scope,
          signal: controller.signal,
          ...(context.inheritedAuth ? { inheritedAuth: context.inheritedAuth } : {}),
          readFile: async (path) => new Uint8Array(await readFile(resolvePath(path))),
        },
      );
      this.post({ type: "httpResponse", requestId, response });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Request failed: ${message}`);
      this.post({ type: "httpError", requestId, message });
    } finally {
      this.inFlight.delete(requestId);
    }
  }

  private async pickAndImportFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: "Import",
      filters: { Collections: ["json", "yaml", "yml", "har"], "All files": ["*"] },
    });
    const uri = uris?.[0];
    if (!uri) {
      return;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      this.importFromText(Buffer.from(bytes).toString("utf-8"), "auto");
    } catch (error) {
      this.reportImportError(error);
    }
  }

  private importFromText(text: string, format: ImportFormat): void {
    try {
      const result = importCollections(text, format);
      this.post({ type: "importResult", collections: result.collections });
      void vscode.window.showInformationMessage(
        `Imported ${result.collections.length} collection(s) (${result.format}).`,
      );
    } catch (error) {
      this.reportImportError(error);
    }
  }

  private reportImportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`Import failed: ${message}`);
    this.post({ type: "importError", message });
    void vscode.window.showErrorMessage(`CodeSetu API Client: import failed — ${message}`);
  }

  private buildScope(context: RequestContext, environmentId: string | undefined): VariableScope {
    const environment = this.state.environments.find((env) => env.id === environmentId);
    return {
      globals: this.state.globals,
      collection: context.collectionVariables,
      ...(environment ? { environment: environment.variables } : {}),
    };
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString("base64");
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css"),
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `connect-src 'none'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri.toString()}" rel="stylesheet" />
    <title>CodeSetu API Client</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
  </body>
</html>`;
  }
}

function readRequestDefaults(): RequestDefaults {
  const config = vscode.workspace.getConfiguration("codesetuApiClient.request");
  return {
    timeoutMs: config.get<number>("timeoutMs", 30_000),
    followRedirects: config.get<boolean>("followRedirects", true),
    maxRedirects: config.get<number>("maxRedirects", 10),
    verifyTls: config.get<boolean>("verifyTls", true),
  };
}

function findRequestContext(collections: Collection[], nodeId: string): RequestContext {
  for (const collection of collections) {
    const inheritedAuth = searchNode(collection.children, nodeId, collection.auth);
    if (inheritedAuth !== undefined) {
      return { collectionVariables: collection.variables, inheritedAuth };
    }
  }
  return { collectionVariables: [] };
}

/**
 * Returns the nearest ancestor auth for the node (folder auth overrides
 * collection auth), or undefined when the node is not in this subtree.
 */
function searchNode(nodes: CollectionNode[], nodeId: string, inherited: Auth): Auth | undefined {
  for (const node of nodes) {
    if (node.kind === "request" && node.id === nodeId) {
      return inherited;
    }
    if (node.kind === "folder") {
      const result = searchNode(node.children, nodeId, node.auth ?? inherited);
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

function resolvePath(path: string): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) {
    return path;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, path).fsPath : path;
}
