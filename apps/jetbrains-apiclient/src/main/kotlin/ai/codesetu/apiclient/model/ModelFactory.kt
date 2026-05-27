package ai.codesetu.apiclient.model

import java.util.UUID

/** Kotlin mirror of packages/api-client-core/src/factory.ts. */
object ModelFactory {
  fun newId(): String = UUID.randomUUID().toString()

  fun requestNode(name: String, protocol: RequestProtocol = RequestProtocol.HTTP): RequestNode =
    RequestNode(
      id = newId(),
      name = name,
      protocol = protocol,
      http = if (protocol == RequestProtocol.HTTP) HttpRequest() else null,
      websocket = if (protocol == RequestProtocol.WEBSOCKET) WebSocketRequest() else null,
    )

  fun folderNode(name: String): FolderNode = FolderNode(id = newId(), name = name)

  fun collection(name: String): Collection = Collection(id = newId(), name = name)
}
