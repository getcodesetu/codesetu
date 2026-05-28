/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import { describe, expect, it } from "vitest";

import { exportPostman } from "../src/export/postman.js";
import { generateCode } from "../src/export/codegen.js";
import { importCollections } from "../src/import/index.js";
import { parseCurl } from "../src/import/curl.js";

describe("parseCurl", () => {
  it("parses method, headers, bearer auth, and a JSON body", () => {
    const node = parseCurl(
      `curl -X POST 'https://api.test/v1/users' -H 'Authorization: Bearer abc' -H 'Content-Type: application/json' -d '{"name":"x"}'`,
    );
    expect(node.http?.method).toBe("POST");
    expect(node.http?.url).toBe("https://api.test/v1/users");
    expect(node.http?.headers).toContainEqual({
      key: "Authorization",
      value: "Bearer abc",
      enabled: true,
    });
    expect(node.http?.body.mode).toBe("raw");
    expect(node.http?.body.raw).toBe('{"name":"x"}');
  });

  it("infers GET when there is no body", () => {
    const node = parseCurl("curl https://api.test/health");
    expect(node.http?.method).toBe("GET");
  });
});

describe("importCollections", () => {
  it("auto-detects and imports a Postman v2.1 collection", () => {
    const postman = JSON.stringify({
      info: {
        name: "Demo",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [
        {
          name: "List Users",
          request: {
            method: "GET",
            header: [{ key: "Accept", value: "application/json" }],
            url: { raw: "https://api.test/users?page=1", query: [{ key: "page", value: "1" }] },
          },
        },
      ],
    });
    const result = importCollections(postman);
    expect(result.format).toBe("postman");
    expect(result.collections[0]?.name).toBe("Demo");
    const node = result.collections[0]?.children[0];
    expect(node?.kind).toBe("request");
    if (node?.kind === "request") {
      expect(node.http?.method).toBe("GET");
      expect(node.http?.queryParams[0]?.key).toBe("page");
    }
  });

  it("auto-detects a HAR log", () => {
    const har = JSON.stringify({
      log: {
        entries: [
          {
            request: { method: "GET", url: "https://api.test/ping", headers: [], queryString: [] },
          },
        ],
      },
    });
    const result = importCollections(har);
    expect(result.format).toBe("har");
    expect(result.collections[0]?.children).toHaveLength(1);
  });

  it("imports an OpenAPI spec from YAML", () => {
    const yaml = [
      "openapi: 3.0.0",
      "info:",
      "  title: Petstore",
      "servers:",
      "  - url: https://api.test",
      "paths:",
      "  /pets/{id}:",
      "    get:",
      "      operationId: getPet",
      "      tags: [pets]",
      "      parameters:",
      "        - name: id",
      "          in: path",
      "          required: true",
    ].join("\n");
    const result = importCollections(yaml);
    expect(result.format).toBe("openapi");
    const folder = result.collections[0]?.children[0];
    expect(folder?.kind).toBe("folder");
    if (folder?.kind === "folder") {
      const request = folder.children[0];
      if (request?.kind === "request") {
        expect(request.http?.url).toBe("https://api.test/pets/:id");
        expect(request.http?.method).toBe("GET");
      }
    }
  });
});

describe("export", () => {
  it("round-trips a collection through Postman export and import", () => {
    const original = importCollections(`curl -X POST 'https://api.test/x' -H 'X-Test: 1' -d 'a=b'`)
      .collections[0];
    const exported = exportPostman(original!);
    const reimported = importCollections(JSON.stringify(exported));
    expect(reimported.format).toBe("postman");
    expect(reimported.collections[0]?.children).toHaveLength(1);
  });

  it("generates a curl snippet", () => {
    const node = parseCurl("curl https://api.test/data");
    const code = generateCode(node.http!, "curl");
    expect(code).toContain("curl -X GET 'https://api.test/data'");
  });

  it("generates python requests code", () => {
    const node = parseCurl(`curl -X POST 'https://api.test/data' -d '{"a":1}'`);
    const code = generateCode(node.http!, "python");
    expect(code).toContain("import requests");
    expect(code).toContain('requests.request("POST"');
  });
});
