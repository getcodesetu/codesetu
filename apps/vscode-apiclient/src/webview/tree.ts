/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * See the repository LICENSE for details.
 */

import type { Collection, CollectionNode, RequestNode } from "@codesetu/api-client-core/model";

export function findRequestNode(
  collections: Collection[],
  nodeId: string,
): RequestNode | undefined {
  for (const collection of collections) {
    const found = findInNodes(collection.children, nodeId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findInNodes(nodes: CollectionNode[], nodeId: string): RequestNode | undefined {
  for (const node of nodes) {
    if (node.kind === "request" && node.id === nodeId) {
      return node;
    }
    if (node.kind === "folder") {
      const found = findInNodes(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** Returns a new collections array with the matching request node replaced. */
export function replaceRequestNode(collections: Collection[], node: RequestNode): Collection[] {
  return collections.map((collection) => ({
    ...collection,
    children: replaceInNodes(collection.children, node),
  }));
}

function replaceInNodes(nodes: CollectionNode[], node: RequestNode): CollectionNode[] {
  return nodes.map((child) => {
    if (child.kind === "request" && child.id === node.id) {
      return node;
    }
    if (child.kind === "folder") {
      return { ...child, children: replaceInNodes(child.children, node) };
    }
    return child;
  });
}

export function removeNode(collections: Collection[], nodeId: string): Collection[] {
  return collections.map((collection) => ({
    ...collection,
    children: removeFromNodes(collection.children, nodeId),
  }));
}

function removeFromNodes(nodes: CollectionNode[], nodeId: string): CollectionNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) =>
      node.kind === "folder" ? { ...node, children: removeFromNodes(node.children, nodeId) } : node,
    );
}

/** Appends a node to a collection (folderId undefined) or to a folder within it. */
export function addNode(
  collections: Collection[],
  collectionId: string,
  folderId: string | undefined,
  node: CollectionNode,
): Collection[] {
  return collections.map((collection) => {
    if (collection.id !== collectionId) {
      return collection;
    }
    if (!folderId) {
      return { ...collection, children: [...collection.children, node] };
    }
    return { ...collection, children: addToFolder(collection.children, folderId, node) };
  });
}

function addToFolder(
  nodes: CollectionNode[],
  folderId: string,
  node: CollectionNode,
): CollectionNode[] {
  return nodes.map((child) => {
    if (child.kind === "folder" && child.id === folderId) {
      return { ...child, children: [...child.children, node] };
    }
    if (child.kind === "folder") {
      return { ...child, children: addToFolder(child.children, folderId, node) };
    }
    return child;
  });
}

export function renameNode(collections: Collection[], nodeId: string, name: string): Collection[] {
  return collections.map((collection) => ({
    ...collection,
    children: renameInNodes(collection.children, nodeId, name),
  }));
}

function renameInNodes(nodes: CollectionNode[], nodeId: string, name: string): CollectionNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, name };
    }
    if (node.kind === "folder") {
      return { ...node, children: renameInNodes(node.children, nodeId, name) };
    }
    return node;
  });
}
