/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * See the repository LICENSE for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCollection,
  createFolderNode,
  createRequestNode,
} from "@codesetu/api-client-core/factory";
import type { Collection, HttpResponse } from "@codesetu/api-client-core/model";

import { emptyState, type HistoryEntry, type PersistedState } from "../protocol";
import { RequestEditor } from "./components/RequestEditor";
import { ResponseViewer } from "./components/ResponseViewer";
import { Sidebar } from "./components/Sidebar";
import { addNode, findRequestNode, removeNode, replaceRequestNode } from "./tree";
import { onHostMessage, post } from "./vscodeApi";

const MAX_HISTORY = 100;

interface TabResponse {
  busy: boolean;
  response?: HttpResponse;
  error?: string;
}

export function App(): JSX.Element {
  const [state, setState] = useState<PersistedState>(emptyState());
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [responses, setResponses] = useState<Record<string, TabResponse>>({});

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const applyState = useCallback((next: PersistedState): void => {
    setState(next);
    post({ type: "persist", state: next });
  }, []);

  useEffect(() => {
    const dispose = onHostMessage((message) => {
      switch (message.type) {
        case "init":
          setState(message.state);
          break;
        case "httpResponse":
          setResponses((prev) => ({
            ...prev,
            [message.requestId]: { busy: false, response: message.response },
          }));
          recordHistory(message.requestId, message.response);
          break;
        case "httpError":
          setResponses((prev) => ({
            ...prev,
            [message.requestId]: { busy: false, error: message.message },
          }));
          break;
        case "importResult":
          mergeCollections(message.collections);
          break;
        default:
          break;
      }
    });
    post({ type: "ready" });
    return dispose;
  }, []);

  const recordHistory = (nodeId: string, response: HttpResponse): void => {
    const node = findRequestNode(stateRef.current.collections, nodeId);
    const entry: HistoryEntry = {
      id: `${nodeId}-${response.timings.startedAt}`,
      at: response.timings.startedAt,
      method: node?.http?.method ?? "GET",
      url: node?.http?.url ?? response.finalUrl,
      status: response.status,
      ok: response.ok,
      durationMs: response.timings.durationMs,
    };
    applyState({
      ...stateRef.current,
      history: [entry, ...stateRef.current.history].slice(0, MAX_HISTORY),
    });
  };

  const mergeCollections = (collections: Collection[]): void => {
    applyState({
      ...stateRef.current,
      collections: [...stateRef.current.collections, ...collections],
    });
  };

  const openRequest = (nodeId: string): void => {
    setTabs((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
    setActiveTab(nodeId);
  };

  const closeTab = (nodeId: string): void => {
    setTabs((prev) => {
      const next = prev.filter((id) => id !== nodeId);
      setActiveTab((current) => (current === nodeId ? next[next.length - 1] : current));
      return next;
    });
  };

  const newCollection = (): void => {
    const collection = createCollection("New Collection");
    applyState({ ...stateRef.current, collections: [...stateRef.current.collections, collection] });
  };

  const addRequest = (collectionId: string, folderId: string | undefined): void => {
    const node = createRequestNode("New Request");
    applyState({
      ...stateRef.current,
      collections: addNode(stateRef.current.collections, collectionId, folderId, node),
    });
    openRequest(node.id);
  };

  const addFolder = (collectionId: string, folderId: string | undefined): void => {
    const folder = createFolderNode("New Folder");
    applyState({
      ...stateRef.current,
      collections: addNode(stateRef.current.collections, collectionId, folderId, folder),
    });
  };

  const deleteNode = (nodeId: string): void => {
    applyState({
      ...stateRef.current,
      collections: removeNode(stateRef.current.collections, nodeId),
    });
    closeTab(nodeId);
  };

  const selectEnvironment = (id: string | undefined): void => {
    applyState({
      ...stateRef.current,
      ...(id ? { activeEnvironmentId: id } : { activeEnvironmentId: undefined }),
    });
  };

  const sendRequest = (nodeId: string): void => {
    const node = findRequestNode(stateRef.current.collections, nodeId);
    if (!node) {
      return;
    }
    setResponses((prev) => ({ ...prev, [nodeId]: { busy: true } }));
    post({
      type: "sendHttpRequest",
      requestId: nodeId,
      node,
      ...(state.activeEnvironmentId ? { environmentId: state.activeEnvironmentId } : {}),
    });
  };

  const cancelRequest = (nodeId: string): void => {
    post({ type: "cancelRequest", requestId: nodeId });
    setResponses((prev) => ({ ...prev, [nodeId]: { busy: false } }));
  };

  const activeNode = activeTab ? findRequestNode(state.collections, activeTab) : undefined;
  const activeResponse = activeTab ? responses[activeTab] : undefined;

  return (
    <div className="app">
      <Sidebar
        collections={state.collections}
        environments={state.environments}
        activeEnvironmentId={state.activeEnvironmentId}
        history={state.history}
        activeNodeId={activeTab}
        onOpenRequest={openRequest}
        onNewCollection={newCollection}
        onAddRequest={addRequest}
        onAddFolder={addFolder}
        onDeleteNode={deleteNode}
        onSelectEnvironment={selectEnvironment}
        onImport={() => post({ type: "pickImportFile" })}
      />

      <main className="main">
        <div className="tabbar">
          {tabs.map((tabId) => {
            const node = findRequestNode(state.collections, tabId);
            return (
              <div
                key={tabId}
                className={tabId === activeTab ? "tabbar__tab tabbar__tab--active" : "tabbar__tab"}
              >
                <button type="button" className="tabbar__open" onClick={() => setActiveTab(tabId)}>
                  <span className={`method method--${(node?.http?.method ?? "get").toLowerCase()}`}>
                    {node?.http?.method ?? "GET"}
                  </span>
                  {node?.name ?? "Request"}
                </button>
                <button type="button" className="tabbar__close" onClick={() => closeTab(tabId)}>
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {activeNode ? (
          <div className="workspace">
            <RequestEditor
              node={activeNode}
              busy={activeResponse?.busy ?? false}
              onChange={(node) =>
                applyState({
                  ...stateRef.current,
                  collections: replaceRequestNode(stateRef.current.collections, node),
                })
              }
              onSend={() => sendRequest(activeNode.id)}
              onCancel={() => cancelRequest(activeNode.id)}
            />
            <ResponseViewer
              response={activeResponse?.response}
              error={activeResponse?.error}
              busy={activeResponse?.busy ?? false}
            />
          </div>
        ) : (
          <div className="empty-state">
            <h2>CodeSetu API Client</h2>
            <p>Create a collection or open a request to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}
