/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * See the repository LICENSE for details.
 */

import { useState } from "react";

import type {
  Auth,
  AuthType,
  BodyMode,
  FormDataField,
  HttpRequest,
  KeyValue,
  RawLanguage,
  RequestNode,
} from "@codesetu/api-client-core/model";

import { KeyValueEditor, Tabs, type TabDescriptor } from "./common";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const RAW_LANGUAGES: RawLanguage[] = ["json", "text", "xml", "html", "javascript"];
const BODY_MODES: { value: BodyMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "raw", label: "Raw" },
  { value: "urlencoded", label: "x-www-form-urlencoded" },
  { value: "form-data", label: "Form Data" },
  { value: "graphql", label: "GraphQL" },
  { value: "binary", label: "Binary" },
];
const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: "none", label: "No Auth" },
  { value: "inherit", label: "Inherit from parent" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "apikey", label: "API Key" },
  { value: "oauth2", label: "OAuth 2.0" },
];

export function RequestEditor({
  node,
  busy,
  onChange,
  onSend,
  onCancel,
}: {
  node: RequestNode;
  busy: boolean;
  onChange: (node: RequestNode) => void;
  onSend: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [tab, setTab] = useState("params");
  const request = node.http;

  if (!request) {
    return <div className="placeholder">This request has no HTTP definition.</div>;
  }

  const patch = (changes: Partial<HttpRequest>): void => {
    onChange({ ...node, http: { ...request, ...changes } });
  };

  const onUrlChange = (url: string): void => {
    patch({ url, pathVariables: syncPathVariables(url, request.pathVariables) });
  };

  const tabs: TabDescriptor[] = [
    { id: "params", label: "Params", badge: countEnabled(request.queryParams) },
    { id: "headers", label: "Headers", badge: countEnabled(request.headers) },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="request-editor">
      <div className="url-bar">
        <select
          className="method-select"
          value={request.method}
          onChange={(event) => patch({ method: event.target.value })}
        >
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <input
          className="url-input"
          value={request.url}
          placeholder="Enter request URL"
          onChange={(event) => onUrlChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) {
              onSend();
            }
          }}
        />
        {busy ? (
          <button type="button" className="send-button send-button--cancel" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="send-button" onClick={onSend}>
            Send
          </button>
        )}
      </div>

      <Tabs tabs={tabs} active={tab} onSelect={setTab} />

      <div className="editor-body">
        {tab === "params" && (
          <ParamsTab
            queryParams={request.queryParams}
            pathVariables={request.pathVariables}
            onQueryChange={(rows) => patch({ queryParams: rows })}
            onPathChange={(rows) => patch({ pathVariables: rows })}
          />
        )}
        {tab === "headers" && (
          <KeyValueEditor rows={request.headers} onChange={(rows) => patch({ headers: rows })} />
        )}
        {tab === "body" && <BodyTab body={request.body} onChange={(body) => patch({ body })} />}
        {tab === "auth" && <AuthTab auth={request.auth} onChange={(auth) => patch({ auth })} />}
        {tab === "settings" && (
          <SettingsTab settings={request.settings} onChange={(settings) => patch({ settings })} />
        )}
      </div>
    </div>
  );
}

function ParamsTab({
  queryParams,
  pathVariables,
  onQueryChange,
  onPathChange,
}: {
  queryParams: KeyValue[];
  pathVariables: KeyValue[];
  onQueryChange: (rows: KeyValue[]) => void;
  onPathChange: (rows: KeyValue[]) => void;
}): JSX.Element {
  return (
    <div className="stack">
      <h4 className="section-title">Query Params</h4>
      <KeyValueEditor rows={queryParams} onChange={onQueryChange} />
      {pathVariables.length > 0 && (
        <>
          <h4 className="section-title">Path Variables</h4>
          <KeyValueEditor rows={pathVariables} onChange={onPathChange} keyPlaceholder="Variable" />
        </>
      )}
    </div>
  );
}

function BodyTab({
  body,
  onChange,
}: {
  body: HttpRequest["body"];
  onChange: (body: HttpRequest["body"]) => void;
}): JSX.Element {
  return (
    <div className="stack">
      <div className="row">
        <select
          className="select"
          value={body.mode}
          onChange={(event) => onChange({ ...body, mode: event.target.value as BodyMode })}
        >
          {BODY_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        {body.mode === "raw" && (
          <select
            className="select"
            value={body.rawLanguage ?? "json"}
            onChange={(event) =>
              onChange({ ...body, rawLanguage: event.target.value as RawLanguage })
            }
          >
            {RAW_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language.toUpperCase()}
              </option>
            ))}
          </select>
        )}
      </div>

      {body.mode === "raw" && (
        <textarea
          className="code-area"
          value={body.raw ?? ""}
          placeholder="Request body"
          onChange={(event) => onChange({ ...body, raw: event.target.value })}
        />
      )}
      {body.mode === "urlencoded" && (
        <KeyValueEditor
          rows={body.urlencoded ?? []}
          onChange={(rows) => onChange({ ...body, urlencoded: rows })}
        />
      )}
      {body.mode === "form-data" && (
        <FormDataEditor
          fields={body.formData ?? []}
          onChange={(formData) => onChange({ ...body, formData })}
        />
      )}
      {body.mode === "graphql" && (
        <div className="stack">
          <textarea
            className="code-area"
            value={body.graphql?.query ?? ""}
            placeholder="query { ... }"
            onChange={(event) =>
              onChange({
                ...body,
                graphql: { ...(body.graphql ?? { query: "" }), query: event.target.value },
              })
            }
          />
          <textarea
            className="code-area code-area--small"
            value={body.graphql?.variables ?? ""}
            placeholder='{ "variables": "as JSON" }'
            onChange={(event) =>
              onChange({
                ...body,
                graphql: { query: body.graphql?.query ?? "", variables: event.target.value },
              })
            }
          />
        </div>
      )}
      {body.mode === "binary" && (
        <input
          className="input"
          value={body.binaryFilePath ?? ""}
          placeholder="Absolute or workspace-relative file path"
          onChange={(event) => onChange({ ...body, binaryFilePath: event.target.value })}
        />
      )}
    </div>
  );
}

function FormDataEditor({
  fields,
  onChange,
}: {
  fields: FormDataField[];
  onChange: (fields: FormDataField[]) => void;
}): JSX.Element {
  const display = [...fields, { key: "", kind: "text" as const, value: "", enabled: true }];
  const commit = (next: FormDataField[]): void => {
    onChange(
      next.filter((field) => field.key !== "" || (field.value ?? "") !== "" || field.filePath),
    );
  };
  const update = (index: number, partial: Partial<FormDataField>): void => {
    commit(display.map((field, i) => (i === index ? { ...field, ...partial } : field)));
  };

  return (
    <table className="kv">
      <tbody>
        {display.map((field, index) => {
          const isBlank = index === display.length - 1;
          return (
            <tr key={index} className="kv__row">
              <td className="kv__toggle">
                {!isBlank && (
                  <input
                    type="checkbox"
                    checked={field.enabled}
                    onChange={(event) => update(index, { enabled: event.target.checked })}
                  />
                )}
              </td>
              <td>
                <input
                  className="kv__input"
                  value={field.key}
                  placeholder="Key"
                  onChange={(event) =>
                    update(index, {
                      key: event.target.value,
                      ...(isBlank ? { enabled: true } : {}),
                    })
                  }
                />
              </td>
              <td>
                <select
                  className="kv__input"
                  value={field.kind}
                  onChange={(event) =>
                    update(index, { kind: event.target.value as FormDataField["kind"] })
                  }
                >
                  <option value="text">Text</option>
                  <option value="file">File</option>
                </select>
              </td>
              <td>
                <input
                  className="kv__input"
                  value={field.kind === "file" ? (field.filePath ?? "") : (field.value ?? "")}
                  placeholder={field.kind === "file" ? "File path" : "Value"}
                  onChange={(event) =>
                    update(
                      index,
                      field.kind === "file"
                        ? { filePath: event.target.value }
                        : { value: event.target.value },
                    )
                  }
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AuthTab({ auth, onChange }: { auth: Auth; onChange: (auth: Auth) => void }): JSX.Element {
  return (
    <div className="stack">
      <select
        className="select"
        value={auth.type}
        onChange={(event) => onChange({ ...auth, type: event.target.value as AuthType })}
      >
        {AUTH_TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>

      {auth.type === "bearer" && (
        <LabeledInput
          label="Token"
          value={auth.bearer?.token ?? ""}
          onChange={(token) => onChange({ ...auth, bearer: { token } })}
        />
      )}
      {auth.type === "basic" && (
        <>
          <LabeledInput
            label="Username"
            value={auth.basic?.username ?? ""}
            onChange={(username) =>
              onChange({ ...auth, basic: { username, password: auth.basic?.password ?? "" } })
            }
          />
          <LabeledInput
            label="Password"
            value={auth.basic?.password ?? ""}
            onChange={(password) =>
              onChange({ ...auth, basic: { username: auth.basic?.username ?? "", password } })
            }
          />
        </>
      )}
      {auth.type === "apikey" && (
        <>
          <LabeledInput
            label="Key"
            value={auth.apikey?.key ?? ""}
            onChange={(key) =>
              onChange({
                ...auth,
                apikey: {
                  key,
                  value: auth.apikey?.value ?? "",
                  location: auth.apikey?.location ?? "header",
                },
              })
            }
          />
          <LabeledInput
            label="Value"
            value={auth.apikey?.value ?? ""}
            onChange={(value) =>
              onChange({
                ...auth,
                apikey: {
                  key: auth.apikey?.key ?? "",
                  value,
                  location: auth.apikey?.location ?? "header",
                },
              })
            }
          />
          <label className="field">
            <span className="field__label">Add to</span>
            <select
              className="select"
              value={auth.apikey?.location ?? "header"}
              onChange={(event) =>
                onChange({
                  ...auth,
                  apikey: {
                    key: auth.apikey?.key ?? "",
                    value: auth.apikey?.value ?? "",
                    location: event.target.value as "header" | "query",
                  },
                })
              }
            >
              <option value="header">Header</option>
              <option value="query">Query Param</option>
            </select>
          </label>
        </>
      )}
      {auth.type === "oauth2" && (
        <LabeledInput
          label="Access Token"
          value={auth.oauth2?.accessToken ?? ""}
          onChange={(accessToken) =>
            onChange({
              ...auth,
              oauth2: { grantType: auth.oauth2?.grantType ?? "client_credentials", accessToken },
            })
          }
        />
      )}
      {auth.type === "inherit" && (
        <p className="hint">This request uses the auth defined on its folder or collection.</p>
      )}
    </div>
  );
}

function SettingsTab({
  settings,
  onChange,
}: {
  settings: HttpRequest["settings"];
  onChange: (settings: HttpRequest["settings"]) => void;
}): JSX.Element {
  return (
    <div className="stack">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.followRedirects}
          onChange={(event) => onChange({ ...settings, followRedirects: event.target.checked })}
        />
        Follow redirects
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.verifyTls}
          onChange={(event) => onChange({ ...settings, verifyTls: event.target.checked })}
        />
        Verify TLS certificates
      </label>
      <LabeledInput
        label="Timeout (ms)"
        value={String(settings.timeoutMs)}
        onChange={(value) => onChange({ ...settings, timeoutMs: Number(value) || 0 })}
      />
      <LabeledInput
        label="Max redirects"
        value={String(settings.maxRedirects)}
        onChange={(value) => onChange({ ...settings, maxRedirects: Number(value) || 0 })}
      />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function countEnabled(rows: KeyValue[]): number {
  return rows.filter((row) => row.enabled && row.key !== "").length;
}

function syncPathVariables(url: string, existing: KeyValue[]): KeyValue[] {
  const names = new Set<string>();
  const matcher = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(url)) !== null) {
    if (match[1]) {
      names.add(match[1]);
    }
  }
  const byKey = new Map(existing.map((row) => [row.key, row]));
  return [...names].map((name) => byKey.get(name) ?? { key: name, value: "", enabled: true });
}
