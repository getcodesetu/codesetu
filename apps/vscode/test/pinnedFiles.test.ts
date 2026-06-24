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

import { describe, expect, it } from "vitest";

import { readPinnedFiles, searchWorkspaceFiles, toSearchGlob } from "../src/pinnedFiles";

type SearchApi = Parameters<typeof searchWorkspaceFiles>[0];
interface FakeUri {
  path: string;
}

/** Minimal stand-in for the bits of the VS Code API these helpers touch. */
function makeVscode(files: string[]): SearchApi {
  const uris: FakeUri[] = files.map((path) => ({ path }));
  const api = {
    workspace: {
      async findFiles(pattern: string, _exclude: string, max: number): Promise<FakeUri[]> {
        if (pattern.endsWith("/**/*")) {
          const folder = pattern.slice(0, -"**/*".length);
          return uris.filter((u) => u.path.startsWith(folder)).slice(0, max);
        }
        return uris.slice(0, max);
      },
      asRelativePath(uri: FakeUri): string {
        return uri.path;
      },
      workspaceFolders: [{ uri: { fsPath: "/root" } }],
      async openTextDocument(uri: FakeUri) {
        return { languageId: "ts", getText: () => `content of ${uri.path}` };
      },
    },
    Uri: {
      joinPath(_base: unknown, path: string): FakeUri {
        return { path };
      },
    },
  };
  return api as unknown as SearchApi;
}

describe("searchWorkspaceFiles", () => {
  it("offers matching folders with a trailing slash alongside files", async () => {
    const vscode = makeVscode(["src/auth/Login.ts", "src/auth/Token.ts", "README.md"]);

    const results = await searchWorkspaceFiles(vscode, "auth");

    expect(results).toContain("src/auth/");
    expect(results).toContain("src/auth/Login.ts");
  });
});

describe("readPinnedFiles", () => {
  it("expands a pinned folder into the files under it", async () => {
    const vscode = makeVscode(["src/auth/Login.ts", "src/auth/Token.ts", "src/db/Pool.ts"]);

    const snippets = await readPinnedFiles(vscode, ["src/auth/"]);
    const paths = snippets.map((s) => s.path);

    expect(paths).toContain("src/auth/Login.ts");
    expect(paths).toContain("src/auth/Token.ts");
    expect(paths).not.toContain("src/db/Pool.ts");
  });

  it("de-dupes a folder pin against an explicitly pinned file", async () => {
    const vscode = makeVscode(["src/auth/Login.ts"]);

    const snippets = await readPinnedFiles(vscode, ["src/auth/Login.ts", "src/auth/"]);

    expect(snippets.filter((s) => s.path === "src/auth/Login.ts")).toHaveLength(1);
  });
});

describe("toSearchGlob", () => {
  it("matches everything for an empty query", () => {
    expect(toSearchGlob("")).toBe("**/*");
  });

  it("wraps a plain query in a recursive substring glob", () => {
    expect(toSearchGlob("config")).toBe("**/*config*");
  });

  it("keeps path-like characters so folder fragments still match", () => {
    expect(toSearchGlob("src/util")).toBe("**/*src/util*");
  });

  it("strips glob metacharacters that could break the pattern", () => {
    expect(toSearchGlob("a*b?{c}")).toBe("**/*abc*");
  });

  it("collapses to match-all when the query is only metacharacters", () => {
    expect(toSearchGlob("**")).toBe("**/*");
  });
});
