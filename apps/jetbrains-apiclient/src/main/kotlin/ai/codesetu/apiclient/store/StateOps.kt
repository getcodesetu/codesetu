package ai.codesetu.apiclient.store

import ai.codesetu.apiclient.model.Auth
import ai.codesetu.apiclient.model.Collection
import ai.codesetu.apiclient.model.CollectionNode
import ai.codesetu.apiclient.model.FolderNode
import ai.codesetu.apiclient.model.RequestNode
import ai.codesetu.apiclient.model.Variable

/** Immutable tree operations over the collection model (Kotlin mirror of tree.ts). */
object StateOps {
  fun findRequest(collections: List<Collection>, id: String): RequestNode? {
    for (collection in collections) {
      findInNodes(collection.children, id)?.let { return it }
    }
    return null
  }

  private fun findInNodes(nodes: List<CollectionNode>, id: String): RequestNode? {
    for (node in nodes) {
      when (node) {
        is RequestNode -> if (node.id == id) return node
        is FolderNode -> findInNodes(node.children, id)?.let { return it }
      }
    }
    return null
  }

  fun replaceRequest(collections: List<Collection>, node: RequestNode): List<Collection> =
    collections.map { it.copy(children = replaceInNodes(it.children, node)) }

  private fun replaceInNodes(nodes: List<CollectionNode>, node: RequestNode): List<CollectionNode> =
    nodes.map { child ->
      when {
        child is RequestNode && child.id == node.id -> node
        child is FolderNode -> child.copy(children = replaceInNodes(child.children, node))
        else -> child
      }
    }

  fun addNode(
    collections: List<Collection>,
    collectionId: String,
    folderId: String?,
    node: CollectionNode,
  ): List<Collection> =
    collections.map { collection ->
      when {
        collection.id != collectionId -> collection
        folderId == null -> collection.copy(children = collection.children + node)
        else -> collection.copy(children = addToFolder(collection.children, folderId, node))
      }
    }

  private fun addToFolder(
    nodes: List<CollectionNode>,
    folderId: String,
    node: CollectionNode,
  ): List<CollectionNode> =
    nodes.map { child ->
      when {
        child is FolderNode && child.id == folderId -> child.copy(children = child.children + node)
        child is FolderNode -> child.copy(children = addToFolder(child.children, folderId, node))
        else -> child
      }
    }

  fun removeNode(collections: List<Collection>, id: String): List<Collection> =
    collections.map { it.copy(children = removeFromNodes(it.children, id)) }

  private fun removeFromNodes(nodes: List<CollectionNode>, id: String): List<CollectionNode> =
    nodes.filter { it.id != id }.map { node ->
      if (node is FolderNode) node.copy(children = removeFromNodes(node.children, id)) else node
    }

  /** Returns the owning collection's variables and the nearest inherited auth for a request. */
  fun requestContext(collections: List<Collection>, id: String): RequestContext {
    for (collection in collections) {
      val auth = searchAuth(collection.children, id, collection.auth)
      if (auth != null) {
        return RequestContext(collection.variables, auth)
      }
    }
    return RequestContext(emptyList(), null)
  }

  private fun searchAuth(nodes: List<CollectionNode>, id: String, inherited: Auth): Auth? {
    for (node in nodes) {
      when (node) {
        is RequestNode -> if (node.id == id) return inherited
        is FolderNode -> searchAuth(node.children, id, node.auth ?: inherited)?.let { return it }
      }
    }
    return null
  }

  data class RequestContext(val collectionVariables: List<Variable>, val inheritedAuth: Auth?)
}
