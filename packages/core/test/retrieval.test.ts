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

import {
  chunkFile,
  cosineSimilarity,
  createSearchWorkspaceTool,
  hashContent,
  retrieveFromWorkspace,
  updateWorkspaceIndex,
  WorkspaceIndex,
  type EmbeddingProvider,
  type WorkspaceFile,
} from "../src/index.js";

/**
 * Deterministic bag-of-words embedder: each text maps to a vector over a fixed
 * vocabulary, so semantically-overlapping texts score higher without a network
 * call. `calls` counts batches to prove incremental re-index skips work.
 */
class FakeEmbedder implements EmbeddingProvider {
  public batches = 0;
  public embedded = 0;
  private readonly vocab = ["auth", "token", "login", "payment", "charge", "refund", "render", "pixel"];

  public embed(texts: string[]): Promise<number[][]> {
    this.batches += 1;
    this.embedded += texts.length;
    return Promise.resolve(
      texts.map((text) => {
        const lower = text.toLowerCase();
        return this.vocab.map((word) => lower.split(word).length - 1);
      }),
    );
  }
}

describe("chunkFile", () => {
  it("splits into overlapping line-aligned chunks", () => {
    const text = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n");
    const chunks = chunkFile("a.ts", text, { maxLines: 10, overlap: 2 });

    expect(chunks[0]).toMatchObject({ path: "a.ts", startLine: 1, endLine: 10 });
    // step = maxLines - overlap = 8, so the next chunk starts at line 9.
    expect(chunks[1]?.startLine).toBe(9);
    expect(chunks.at(-1)?.endLine).toBe(25);
  });

  it("returns nothing for whitespace-only files", () => {
    expect(chunkFile("blank.ts", "   \n\n  ")).toEqual([]);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical directions and 0 for a zero vector", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

const FILES: WorkspaceFile[] = [
  { path: "src/auth.ts", text: "function login() {}\nvalidate auth token here\n" },
  { path: "src/payments.ts", text: "function charge() {}\nissue a refund payment\n" },
  { path: "src/ui.ts", text: "function render() {}\ndraw every pixel\n" },
];

describe("updateWorkspaceIndex", () => {
  it("indexes all files on first run and skips unchanged ones after", async () => {
    const embedder = new FakeEmbedder();
    const index = new WorkspaceIndex("fake-model");

    const first = await updateWorkspaceIndex(index, embedder, FILES);
    expect(first).toEqual({ indexed: 3, skipped: 0, removed: 0 });
    expect(index.chunkCount).toBeGreaterThan(0);

    const second = await updateWorkspaceIndex(index, embedder, FILES);
    expect(second).toEqual({ indexed: 0, skipped: 3, removed: 0 });
  });

  it("re-embeds only the changed file and drops deleted ones", async () => {
    const embedder = new FakeEmbedder();
    const index = new WorkspaceIndex("fake-model");
    await updateWorkspaceIndex(index, embedder, FILES);
    const embeddedAfterFirst = embedder.embedded;

    const changed: WorkspaceFile[] = [
      { path: "src/auth.ts", text: "function login() {}\nrefresh the auth token now\n" },
      FILES[1]!,
      // src/ui.ts removed.
    ];
    const result = await updateWorkspaceIndex(index, embedder, changed);

    expect(result.indexed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.removed).toBe(1);
    expect(index.paths()).not.toContain("src/ui.ts");
    // Only the changed file's chunks were re-embedded.
    expect(embedder.embedded - embeddedAfterFirst).toBeLessThan(embeddedAfterFirst);
  });
});

describe("retrieveFromWorkspace", () => {
  it("ranks the semantically-closest file first", async () => {
    const embedder = new FakeEmbedder();
    const index = new WorkspaceIndex("fake-model");
    await updateWorkspaceIndex(index, embedder, FILES);

    const hits = await retrieveFromWorkspace(index, embedder, "how do we validate the auth token", { k: 3 });
    expect(hits[0]?.path).toBe("src/auth.ts");
  });

  it("returns nothing for a blank query or empty index", async () => {
    const embedder = new FakeEmbedder();
    const empty = new WorkspaceIndex("fake-model");
    expect(await retrieveFromWorkspace(empty, embedder, "anything")).toEqual([]);

    const index = new WorkspaceIndex("fake-model");
    await updateWorkspaceIndex(index, embedder, FILES);
    expect(await retrieveFromWorkspace(index, embedder, "   ")).toEqual([]);
  });
});

describe("WorkspaceIndex serialization", () => {
  it("round-trips through serialize/deserialize", async () => {
    const embedder = new FakeEmbedder();
    const index = new WorkspaceIndex("fake-model");
    await updateWorkspaceIndex(index, embedder, FILES);

    const restored = WorkspaceIndex.deserialize(index.serialize(), "fake-model");
    expect(restored.chunkCount).toBe(index.chunkCount);
    expect(restored.paths().sort()).toEqual(index.paths().sort());

    const hits = await retrieveFromWorkspace(restored, embedder, "issue a refund", { k: 1 });
    expect(hits[0]?.path).toBe("src/payments.ts");
  });

  it("discards an index built with a different model", () => {
    const index = new WorkspaceIndex("model-a");
    const restored = WorkspaceIndex.deserialize(index.serialize(), "model-b");
    expect(restored.chunkCount).toBe(0);
  });
});

describe("createSearchWorkspaceTool", () => {
  it("exposes a safe tool that returns formatted hits", async () => {
    const embedder = new FakeEmbedder();
    const index = new WorkspaceIndex("fake-model");
    await updateWorkspaceIndex(index, embedder, FILES);

    const tool = createSearchWorkspaceTool({ index, provider: embedder });
    expect(tool.risk).toBe("safe");

    const result = await tool.execute({ query: "validate auth token" }, { host: {} as never });
    expect(result.isError).toBeUndefined();
    expect(result.content).toContain("src/auth.ts:");
  });

  it("reports a missing query as an error", async () => {
    const tool = createSearchWorkspaceTool({
      index: new WorkspaceIndex("fake-model"),
      provider: new FakeEmbedder(),
    });
    const result = await tool.execute({}, { host: {} as never });
    expect(result.isError).toBe(true);
  });
});

describe("hashContent", () => {
  it("is stable and content-sensitive", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });
});
