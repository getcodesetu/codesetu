/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * See the repository LICENSE for details.
 */

import { useState } from "react";

import type { HttpResponse } from "@codesetu/api-client-core/model";

import { Tabs, type TabDescriptor } from "./common";

export function ResponseViewer({
  response,
  error,
  busy,
}: {
  response: HttpResponse | undefined;
  error: string | undefined;
  busy: boolean;
}): JSX.Element {
  const [tab, setTab] = useState("body");
  const [pretty, setPretty] = useState(true);

  if (busy) {
    return <div className="placeholder">Sending request…</div>;
  }
  if (error) {
    return <div className="placeholder placeholder--error">{error}</div>;
  }
  if (!response) {
    return <div className="placeholder">Send a request to see the response.</div>;
  }

  const tabs: TabDescriptor[] = [
    { id: "body", label: "Body" },
    { id: "headers", label: "Headers", badge: response.headers.length },
    { id: "cookies", label: "Cookies", badge: response.cookies.length },
    { id: "tests", label: "Tests", badge: response.testResults.length },
  ];

  return (
    <div className="response-viewer">
      <div className="response-status">
        <span className={statusClass(response.status)}>
          {response.status} {response.statusText}
        </span>
        <span className="response-meta">{response.timings.durationMs} ms</span>
        <span className="response-meta">{formatBytes(response.sizeBytes)}</span>
        {response.contentType && <span className="response-meta">{response.contentType}</span>}
      </div>

      <Tabs tabs={tabs} active={tab} onSelect={setTab} />

      <div className="response-body">
        {tab === "body" && (
          <BodyPane response={response} pretty={pretty} onTogglePretty={() => setPretty((v) => !v)} />
        )}
        {tab === "headers" && <HeaderTable response={response} />}
        {tab === "cookies" && <CookieTable response={response} />}
        {tab === "tests" && <TestList response={response} />}
      </div>
    </div>
  );
}

function BodyPane({
  response,
  pretty,
  onTogglePretty,
}: {
  response: HttpResponse;
  pretty: boolean;
  onTogglePretty: () => void;
}): JSX.Element {
  if (response.bodyBase64 !== undefined) {
    return <div className="placeholder">Binary response ({formatBytes(response.sizeBytes)}).</div>;
  }
  const text = pretty ? prettyPrint(response.bodyText, response.contentType) : response.bodyText;
  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="chip" onClick={onTogglePretty}>
          {pretty ? "Raw" : "Pretty"}
        </button>
      </div>
      <pre className="code-output">{text}</pre>
    </div>
  );
}

function HeaderTable({ response }: { response: HttpResponse }): JSX.Element {
  return (
    <table className="readonly-table">
      <tbody>
        {response.headers.map((header, index) => (
          <tr key={index}>
            <td className="readonly-table__key">{header.key}</td>
            <td>{header.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CookieTable({ response }: { response: HttpResponse }): JSX.Element {
  if (response.cookies.length === 0) {
    return <div className="placeholder">No cookies set.</div>;
  }
  return (
    <table className="readonly-table">
      <tbody>
        {response.cookies.map((cookie, index) => (
          <tr key={index}>
            <td className="readonly-table__key">{cookie.name}</td>
            <td>{cookie.value}</td>
            <td>{cookie.domain ?? ""}</td>
            <td>{cookie.path ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TestList({ response }: { response: HttpResponse }): JSX.Element {
  if (response.testResults.length === 0) {
    return <div className="placeholder">No tests ran for this request.</div>;
  }
  return (
    <ul className="test-list">
      {response.testResults.map((test, index) => (
        <li key={index} className={test.passed ? "test test--pass" : "test test--fail"}>
          <span className="test__badge">{test.passed ? "PASS" : "FAIL"}</span>
          <span>{test.name}</span>
          {test.error && <span className="test__error">{test.error}</span>}
        </li>
      ))}
    </ul>
  );
}

function prettyPrint(body: string, contentType: string | undefined): string {
  if (contentType && (contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("["))) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) {
    return "status-pill status-pill--success";
  }
  if (status >= 400) {
    return "status-pill status-pill--error";
  }
  return "status-pill status-pill--warn";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
