/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface EchoResponse {
  method: string;
  auth: string | null;
  body: string;
}

import { applyAuth } from "../src/engine/auth.js";
import { executeHttpRequest } from "../src/engine/http.js";
import { resolveVariables } from "../src/engine/variables.js";
import { createDefaultHttpRequest } from "../src/factory.js";

describe("resolveVariables", () => {
  it("applies environment precedence over collection and globals", () => {
    const out = resolveVariables("{{base}}/{{path}}", {
      globals: [{ key: "base", value: "https://global", enabled: true }],
      collection: [{ key: "base", value: "https://collection", enabled: true }],
      environment: [
        { key: "base", value: "https://env", enabled: true },
        { key: "path", value: "users", enabled: true },
      ],
    });
    expect(out).toBe("https://env/users");
  });

  it("resolves nested variables and ignores unknown tokens", () => {
    const out = resolveVariables("{{full}}", {
      environment: [
        { key: "full", value: "{{host}}:{{port}}", enabled: true },
        { key: "host", value: "localhost", enabled: true },
        { key: "port", value: "8080", enabled: true },
      ],
    });
    expect(out).toBe("localhost:8080");
    expect(resolveVariables("{{missing}}", {})).toBe("{{missing}}");
  });
});

describe("applyAuth", () => {
  it("builds a basic auth header", () => {
    const result = applyAuth({ type: "basic", basic: { username: "user", password: "pass" } });
    expect(result.headers[0]).toEqual({
      key: "Authorization",
      value: `Basic ${Buffer.from("user:pass").toString("base64")}`,
    });
  });

  it("places an api key in the query when configured", () => {
    const result = applyAuth({
      type: "apikey",
      apikey: { key: "token", value: "secret", location: "query" },
    });
    expect(result.queryParams).toEqual([{ key: "token", value: "secret" }]);
    expect(result.headers).toEqual([]);
  });
});

describe("executeHttpRequest", () => {
  let server: http.Server;
  let baseUrl = "";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "/target" });
        res.end();
        return;
      }
      if (req.url === "/target") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            method: req.method,
            auth: req.headers.authorization ?? null,
            body: Buffer.concat(chunks).toString("utf-8"),
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("executes a GET and decodes a JSON body", async () => {
    const response = await executeHttpRequest(
      createDefaultHttpRequest({ method: "GET", url: `${baseUrl}/echo` }),
    );
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect((JSON.parse(response.bodyText) as EchoResponse).method).toBe("GET");
    expect(response.timings.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("sends a raw JSON body with bearer auth", async () => {
    const response = await executeHttpRequest(
      createDefaultHttpRequest({
        method: "POST",
        url: `${baseUrl}/echo`,
        auth: { type: "bearer", bearer: { token: "abc123" } },
        body: { mode: "raw", rawLanguage: "json", raw: '{"hello":"world"}' },
      }),
    );
    const parsed = JSON.parse(response.bodyText) as EchoResponse;
    expect(parsed.method).toBe("POST");
    expect(parsed.auth).toBe("Bearer abc123");
    expect(parsed.body).toBe('{"hello":"world"}');
  });

  it("follows redirects and reports the final url", async () => {
    const response = await executeHttpRequest(
      createDefaultHttpRequest({ method: "GET", url: `${baseUrl}/redirect` }),
    );
    expect(response.status).toBe(200);
    expect(response.redirected).toBe(true);
    expect(response.finalUrl.endsWith("/target")).toBe(true);
  });
});
