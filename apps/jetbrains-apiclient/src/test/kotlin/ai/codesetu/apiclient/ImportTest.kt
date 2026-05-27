package ai.codesetu.apiclient

import ai.codesetu.apiclient.importer.CollectionImporter
import ai.codesetu.apiclient.importer.CurlParser
import ai.codesetu.apiclient.importer.ImportFormat
import ai.codesetu.apiclient.model.BodyMode
import ai.codesetu.apiclient.model.FolderNode
import ai.codesetu.apiclient.model.RequestNode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ImportTest {
  @Test
  fun parsesCurl() {
    val node = CurlParser.parse(
      "curl -X POST 'https://api.test/v1/users' -H 'Authorization: Bearer abc' -d '{\"name\":\"x\"}'",
    )
    assertEquals("POST", node.http?.method)
    assertEquals("https://api.test/v1/users", node.http?.url)
    assertEquals(BodyMode.RAW, node.http?.body?.mode)
    assertTrue(node.http?.headers?.any { it.key == "Authorization" && it.value == "Bearer abc" } == true)
  }

  @Test
  fun importsPostmanCollection() {
    val postman = """
      {
        "info": { "name": "Demo", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
        "item": [
          {
            "name": "List Users",
            "request": {
              "method": "GET",
              "url": { "raw": "https://api.test/users?page=1", "query": [{ "key": "page", "value": "1" }] }
            }
          }
        ]
      }
    """.trimIndent()
    val result = CollectionImporter.importCollections(postman)
    assertEquals(ImportFormat.POSTMAN, result.format)
    assertEquals("Demo", result.collections[0].name)
    val node = result.collections[0].children[0] as RequestNode
    assertEquals("GET", node.http?.method)
    assertEquals("page", node.http?.queryParams?.get(0)?.key)
  }

  @Test
  fun importsHarLog() {
    val har = """
      { "log": { "entries": [ { "request": { "method": "GET", "url": "https://api.test/ping", "headers": [] } } ] } }
    """.trimIndent()
    val result = CollectionImporter.importCollections(har)
    assertEquals(ImportFormat.HAR, result.format)
    assertEquals(1, result.collections[0].children.size)
  }

  @Test
  fun importsOpenApiYaml() {
    val yaml = """
      openapi: 3.0.0
      info:
        title: Petstore
      servers:
        - url: https://api.test
      paths:
        /pets/{id}:
          get:
            operationId: getPet
            tags: [pets]
            parameters:
              - name: id
                in: path
                required: true
    """.trimIndent()
    val result = CollectionImporter.importCollections(yaml)
    assertEquals(ImportFormat.OPENAPI, result.format)
    val folder = result.collections[0].children[0] as FolderNode
    val request = folder.children[0] as RequestNode
    assertEquals("https://api.test/pets/:id", request.http?.url)
  }
}
