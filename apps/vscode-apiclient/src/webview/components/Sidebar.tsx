/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * See the repository LICENSE for details.
 */

import { useState } from "react";

import type { Collection, CollectionNode, Environment } from "@codesetu/api-client-core/model";

import type { HistoryEntry } from "../../protocol";

export function Sidebar({
  collections,
  environments,
  activeEnvironmentId,
  history,
  activeNodeId,
  onOpenRequest,
  onNewCollection,
  onAddRequest,
  onAddFolder,
  onDeleteNode,
  onSelectEnvironment,
  onImport,
}: {
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | undefined;
  history: HistoryEntry[];
  activeNodeId: string | undefined;
  onOpenRequest: (nodeId: string) => void;
  onNewCollection: () => void;
  onAddRequest: (collectionId: string, folderId: string | undefined) => void;
  onAddFolder: (collectionId: string, folderId: string | undefined) => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectEnvironment: (id: string | undefined) => void;
  onImport: () => void;
}): JSX.Element {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <aside className="sidebar">
      <div className="sidebar__toolbar">
        <button type="button" className="chip" onClick={onNewCollection}>
          + Collection
        </button>
        <button type="button" className="chip" onClick={onImport}>
          Import
        </button>
      </div>

      <div className="sidebar__env">
        <select
          className="select select--full"
          value={activeEnvironmentId ?? ""}
          onChange={(event) => onSelectEnvironment(event.target.value || undefined)}
        >
          <option value="">No Environment</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar__tree">
        {collections.length === 0 && (
          <p className="hint hint--padded">No collections yet. Create one or import.</p>
        )}
        {collections.map((collection) => (
          <CollectionView
            key={collection.id}
            collection={collection}
            activeNodeId={activeNodeId}
            onOpenRequest={onOpenRequest}
            onAddRequest={onAddRequest}
            onAddFolder={onAddFolder}
            onDeleteNode={onDeleteNode}
          />
        ))}
      </div>

      <div className="sidebar__history">
        <button
          type="button"
          className="sidebar__section-toggle"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "▾" : "▸"} History
        </button>
        {showHistory && (
          <ul className="history-list">
            {history.length === 0 && <li className="hint">No requests sent yet.</li>}
            {history.slice(0, 30).map((entry) => (
              <li key={entry.id} className="history-item">
                <span className={`method method--${entry.method.toLowerCase()}`}>
                  {entry.method}
                </span>
                <span className="history-item__url">{entry.url}</span>
                {entry.status !== undefined && (
                  <span className="history-item__status">{entry.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function CollectionView({
  collection,
  activeNodeId,
  onOpenRequest,
  onAddRequest,
  onAddFolder,
  onDeleteNode,
}: {
  collection: Collection;
  activeNodeId: string | undefined;
  onOpenRequest: (nodeId: string) => void;
  onAddRequest: (collectionId: string, folderId: string | undefined) => void;
  onAddFolder: (collectionId: string, folderId: string | undefined) => void;
  onDeleteNode: (nodeId: string) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="tree-collection">
      <div className="tree-row tree-row--collection">
        <button type="button" className="tree-row__toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "▾" : "▸"}
        </button>
        <span className="tree-row__label">{collection.name}</span>
        <span className="tree-row__actions">
          <button
            type="button"
            className="icon-button"
            title="Add request"
            onClick={() => onAddRequest(collection.id, undefined)}
          >
            +
          </button>
          <button
            type="button"
            className="icon-button"
            title="Add folder"
            onClick={() => onAddFolder(collection.id, undefined)}
          >
            ▸+
          </button>
        </span>
      </div>
      {expanded && (
        <NodeList
          nodes={collection.children}
          depth={1}
          collectionId={collection.id}
          activeNodeId={activeNodeId}
          onOpenRequest={onOpenRequest}
          onAddRequest={onAddRequest}
          onAddFolder={onAddFolder}
          onDeleteNode={onDeleteNode}
        />
      )}
    </div>
  );
}

function NodeList({
  nodes,
  depth,
  collectionId,
  activeNodeId,
  onOpenRequest,
  onAddRequest,
  onAddFolder,
  onDeleteNode,
}: {
  nodes: CollectionNode[];
  depth: number;
  collectionId: string;
  activeNodeId: string | undefined;
  onOpenRequest: (nodeId: string) => void;
  onAddRequest: (collectionId: string, folderId: string | undefined) => void;
  onAddFolder: (collectionId: string, folderId: string | undefined) => void;
  onDeleteNode: (nodeId: string) => void;
}): JSX.Element {
  return (
    <div className="tree-children">
      {nodes.map((node) =>
        node.kind === "folder" ? (
          <FolderView
            key={node.id}
            folderId={node.id}
            name={node.name}
            childNodes={node.children}
            depth={depth}
            collectionId={collectionId}
            activeNodeId={activeNodeId}
            onOpenRequest={onOpenRequest}
            onAddRequest={onAddRequest}
            onAddFolder={onAddFolder}
            onDeleteNode={onDeleteNode}
          />
        ) : (
          <div
            key={node.id}
            className={node.id === activeNodeId ? "tree-row tree-row--active" : "tree-row"}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <button type="button" className="tree-row__open" onClick={() => onOpenRequest(node.id)}>
              <span className={`method method--${(node.http?.method ?? "get").toLowerCase()}`}>
                {node.protocol === "websocket" ? "WS" : (node.http?.method ?? "GET")}
              </span>
              <span className="tree-row__label">{node.name}</span>
            </button>
            <span className="tree-row__actions">
              <button
                type="button"
                className="icon-button"
                title="Delete"
                onClick={() => onDeleteNode(node.id)}
              >
                ×
              </button>
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function FolderView({
  folderId,
  name,
  childNodes,
  depth,
  collectionId,
  activeNodeId,
  onOpenRequest,
  onAddRequest,
  onAddFolder,
  onDeleteNode,
}: {
  folderId: string;
  name: string;
  childNodes: CollectionNode[];
  depth: number;
  collectionId: string;
  activeNodeId: string | undefined;
  onOpenRequest: (nodeId: string) => void;
  onAddRequest: (collectionId: string, folderId: string | undefined) => void;
  onAddFolder: (collectionId: string, folderId: string | undefined) => void;
  onDeleteNode: (nodeId: string) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="tree-folder">
      <div className="tree-row" style={{ paddingLeft: `${depth * 12}px` }}>
        <button type="button" className="tree-row__toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "▾" : "▸"}
        </button>
        <span className="tree-row__label tree-row__label--folder">{name}</span>
        <span className="tree-row__actions">
          <button
            type="button"
            className="icon-button"
            title="Add request"
            onClick={() => onAddRequest(collectionId, folderId)}
          >
            +
          </button>
          <button
            type="button"
            className="icon-button"
            title="Delete"
            onClick={() => onDeleteNode(folderId)}
          >
            ×
          </button>
        </span>
      </div>
      {expanded && (
        <NodeList
          nodes={childNodes}
          depth={depth + 1}
          collectionId={collectionId}
          activeNodeId={activeNodeId}
          onOpenRequest={onOpenRequest}
          onAddRequest={onAddRequest}
          onAddFolder={onAddFolder}
          onDeleteNode={onDeleteNode}
        />
      )}
    </div>
  );
}
