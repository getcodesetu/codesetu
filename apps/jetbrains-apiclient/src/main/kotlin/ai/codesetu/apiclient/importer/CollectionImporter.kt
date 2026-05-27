package ai.codesetu.apiclient.importer

import ai.codesetu.apiclient.model.ApiKeyAuth
import ai.codesetu.apiclient.model.Auth
import ai.codesetu.apiclient.model.AuthType
import ai.codesetu.apiclient.model.BasicAuth
import ai.codesetu.apiclient.model.BearerAuth
import ai.codesetu.apiclient.model.BodyMode
import ai.codesetu.apiclient.model.Collection
import ai.codesetu.apiclient.model.CollectionNode
import ai.codesetu.apiclient.model.FolderNode
import ai.codesetu.apiclient.model.FormDataField
import ai.codesetu.apiclient.model.FormFieldKind
import ai.codesetu.apiclient.model.GraphQlBody
import ai.codesetu.apiclient.model.HttpRequest
import ai.codesetu.apiclient.model.KeyValue
import ai.codesetu.apiclient.model.ModelFactory
import ai.codesetu.apiclient.model.RawLanguage
import ai.codesetu.apiclient.model.RequestBody
import ai.codesetu.apiclient.model.RequestNode
import ai.codesetu.apiclient.model.RequestProtocol
import ai.codesetu.apiclient.model.Variable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import org.yaml.snakeyaml.Yaml

enum class ImportFormat { POSTMAN, OPENAPI, INSOMNIA, HAR, CURL, AUTO }

data class ImportResult(val collections: List<Collection>, val format: ImportFormat)

/** Kotlin mirror of packages/api-client-core/src/import. */
object CollectionImporter {
  private val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
  private val httpMethods = listOf("get", "post", "put", "patch", "delete", "head", "options")

  fun importCollections(text: String, format: ImportFormat = ImportFormat.AUTO): ImportResult {
    val trimmed = text.trim()
    if (format == ImportFormat.CURL ||
      (format == ImportFormat.AUTO && Regex("^curl\\b", RegexOption.IGNORE_CASE).containsMatchIn(trimmed))
    ) {
      val collection = ModelFactory.collection("cURL Import").copy(children = listOf(CurlParser.parse(trimmed)))
      return ImportResult(listOf(collection), ImportFormat.CURL)
    }

    val doc = parseDoc(trimmed)
    return when (format) {
      ImportFormat.POSTMAN -> ImportResult(listOf(importPostman(doc)), ImportFormat.POSTMAN)
      ImportFormat.OPENAPI -> ImportResult(listOf(importOpenApi(doc)), ImportFormat.OPENAPI)
      ImportFormat.INSOMNIA -> ImportResult(listOf(importInsomnia(doc)), ImportFormat.INSOMNIA)
      ImportFormat.HAR -> ImportResult(listOf(importHar(doc)), ImportFormat.HAR)
      else -> autoDetect(doc)
    }
  }

  private fun autoDetect(doc: JsonElement): ImportResult = when {
    isOpenApi(doc) -> ImportResult(listOf(importOpenApi(doc)), ImportFormat.OPENAPI)
    isInsomnia(doc) -> ImportResult(listOf(importInsomnia(doc)), ImportFormat.INSOMNIA)
    isHar(doc) -> ImportResult(listOf(importHar(doc)), ImportFormat.HAR)
    isPostman(doc) -> ImportResult(listOf(importPostman(doc)), ImportFormat.POSTMAN)
    else -> throw IllegalArgumentException(
      "Unrecognized collection format. Expected Postman, OpenAPI, Insomnia, HAR, or cURL.",
    )
  }

  // --- Detection -------------------------------------------------------------

  private fun isPostman(doc: JsonElement): Boolean {
    val obj = doc.obj() ?: return false
    return obj["item"] is JsonArray || obj["info"].obj()?.get("schema").str() != null
  }

  private fun isOpenApi(doc: JsonElement): Boolean {
    val obj = doc.obj() ?: return false
    val hasVersion = obj["openapi"].str() != null || obj["swagger"].str() != null
    return hasVersion && obj["paths"] is JsonObject
  }

  private fun isInsomnia(doc: JsonElement): Boolean {
    val obj = doc.obj() ?: return false
    return obj["_type"].str() == "export" && obj["resources"] is JsonArray
  }

  private fun isHar(doc: JsonElement): Boolean =
    doc.obj()?.get("log").obj()?.get("entries") is JsonArray

  // --- Postman ---------------------------------------------------------------

  private fun importPostman(doc: JsonElement): Collection {
    val root = doc.obj() ?: return ModelFactory.collection("Imported Collection")
    return Collection(
      id = ModelFactory.newId(),
      name = root["info"].obj()?.get("name").str() ?: "Imported Collection",
      variables = mapPostmanVariables(root["variable"].arr()),
      auth = mapPostmanAuth(root["auth"].obj()),
      children = (root["item"].arr() ?: JsonArray(emptyList())).mapNotNull { mapPostmanItem(it.obj()) },
    )
  }

  private fun mapPostmanItem(item: JsonObject?): CollectionNode? {
    if (item == null) return null
    val children = item["item"].arr()
    if (children != null) {
      return FolderNode(
        id = ModelFactory.newId(),
        name = item["name"].str() ?: "Folder",
        auth = item["auth"].obj()?.let { mapPostmanAuth(it) },
        children = children.mapNotNull { mapPostmanItem(it.obj()) },
      )
    }
    val req = item["request"].obj()
    val request = HttpRequest(
      method = req?.get("method").str() ?: "GET",
      headers = mapKeyValues(req?.get("header").arr(), "key", "value", "disabled"),
      auth = mapPostmanAuth(req?.get("auth").obj()),
    ).let { applyPostmanUrl(it, req?.get("url")) }
      .copy(body = mapPostmanBody(req?.get("body").obj()))
    return RequestNode(
      id = ModelFactory.newId(),
      name = item["name"].str() ?: request.url,
      protocol = RequestProtocol.HTTP,
      http = request,
    )
  }

  private fun applyPostmanUrl(request: HttpRequest, url: JsonElement?): HttpRequest {
    if (url == null) return request
    (url as? JsonPrimitive)?.contentOrNull?.let { return request.copy(url = it) }
    val obj = url.obj() ?: return request
    val raw = obj["raw"].str() ?: buildUrlString(obj)
    return request.copy(
      url = raw,
      queryParams = mapKeyValues(obj["query"].arr(), "key", "value", "disabled"),
      pathVariables = mapKeyValues(obj["variable"].arr(), "key", "value", null),
    )
  }

  private fun buildUrlString(url: JsonObject): String {
    val host = url["host"].arr()?.mapNotNull { it.str() }?.joinToString(".") ?: ""
    val path = url["path"].arr()?.mapNotNull { it.str() }?.joinToString("/") ?: ""
    if (host.isEmpty() && path.isEmpty()) return ""
    return host + if (path.isNotEmpty()) "/$path" else ""
  }

  private fun mapPostmanBody(body: JsonObject?): RequestBody {
    val obj = body ?: return RequestBody(mode = BodyMode.NONE)
    val mode = obj["mode"].str() ?: return RequestBody(mode = BodyMode.NONE)
    return when (mode) {
      "raw" -> RequestBody(
        mode = BodyMode.RAW,
        raw = obj["raw"].str() ?: "",
        rawLanguage = mapLanguage(obj["options"].obj()?.get("raw").obj()?.get("language").str()),
      )
      "urlencoded" -> RequestBody(
        mode = BodyMode.URLENCODED,
        urlencoded = mapKeyValues(obj["urlencoded"].arr(), "key", "value", "disabled"),
      )
      "formdata" -> RequestBody(
        mode = BodyMode.FORM_DATA,
        formData = (obj["formdata"].arr() ?: JsonArray(emptyList())).mapNotNull { element ->
          val field = element.obj() ?: return@mapNotNull null
          if (field["type"].str() == "file") {
            FormDataField(key = field["key"].str() ?: "", kind = FormFieldKind.FILE, filePath = field["src"].str() ?: "")
          } else {
            FormDataField(key = field["key"].str() ?: "", kind = FormFieldKind.TEXT, value = field["value"].str() ?: "")
          }
        },
      )
      "graphql" -> RequestBody(
        mode = BodyMode.GRAPHQL,
        graphql = GraphQlBody(
          query = obj["graphql"].obj()?.get("query").str() ?: "",
          variables = obj["graphql"].obj()?.get("variables").str(),
        ),
      )
      else -> RequestBody(mode = BodyMode.NONE)
    }
  }

  private fun mapPostmanAuth(auth: JsonObject?): Auth {
    val obj = auth ?: return Auth()
    val type = obj["type"].str() ?: return Auth()
    return when (type) {
      "bearer" -> Auth(type = AuthType.BEARER, bearer = BearerAuth(readAuthValue(obj["bearer"].arr(), "token")))
      "basic" -> Auth(
        type = AuthType.BASIC,
        basic = BasicAuth(readAuthValue(obj["basic"].arr(), "username"), readAuthValue(obj["basic"].arr(), "password")),
      )
      "apikey" -> Auth(
        type = AuthType.APIKEY,
        apikey = ApiKeyAuth(
          readAuthValue(obj["apikey"].arr(), "key"),
          readAuthValue(obj["apikey"].arr(), "value"),
          if (readAuthValue(obj["apikey"].arr(), "in") == "query") {
            ai.codesetu.apiclient.model.ApiKeyLocation.QUERY
          } else {
            ai.codesetu.apiclient.model.ApiKeyLocation.HEADER
          },
        ),
      )
      else -> Auth()
    }
  }

  private fun readAuthValue(entries: JsonArray?, key: String): String =
    entries?.firstOrNull { it.obj()?.get("key").str() == key }?.obj()?.get("value").str() ?: ""

  private fun mapPostmanVariables(variables: JsonArray?): List<Variable> =
    (variables ?: JsonArray(emptyList())).mapNotNull { element ->
      val obj = element.obj() ?: return@mapNotNull null
      Variable(obj["key"].str() ?: "", obj["value"].str() ?: "", obj["disabled"].bool() != true)
    }

  // --- HAR -------------------------------------------------------------------

  private fun importHar(doc: JsonElement): Collection {
    val entries = doc.obj()?.get("log").obj()?.get("entries").arr() ?: JsonArray(emptyList())
    val children = entries.mapNotNull { entry ->
      val req = entry.obj()?.get("request").obj() ?: return@mapNotNull null
      val url = stripQuery(req["url"].str() ?: "")
      val request = HttpRequest(
        method = req["method"].str() ?: "GET",
        url = url,
        headers = mapKeyValues(req["headers"].arr(), "name", "value", null).filterNot { it.key.startsWith(":") },
        queryParams = mapKeyValues(req["queryString"].arr(), "name", "value", null),
        body = mapHarBody(req["postData"].obj()),
      )
      RequestNode(ModelFactory.newId(), "${request.method} $url", RequestProtocol.HTTP, request)
    }
    return ModelFactory.collection("HAR Import").copy(children = children)
  }

  private fun mapHarBody(postData: JsonObject?): RequestBody {
    val text = postData?.get("text").str()
    val mime = postData?.get("mimeType").str()?.lowercase() ?: ""
    return when {
      postData == null -> RequestBody(mode = BodyMode.NONE)
      mime.contains("x-www-form-urlencoded") ->
        RequestBody(mode = BodyMode.URLENCODED, urlencoded = mapKeyValues(postData["params"].arr(), "name", "value", null))
      text != null -> RequestBody(mode = BodyMode.RAW, raw = text, rawLanguage = languageForMime(mime))
      else -> RequestBody(mode = BodyMode.NONE)
    }
  }

  // --- Insomnia --------------------------------------------------------------

  private fun importInsomnia(doc: JsonElement): Collection {
    val resources = doc.obj()?.get("resources").arr() ?: JsonArray(emptyList())
    val byParent = HashMap<String, MutableList<JsonObject>>()
    var workspaceId = ""
    var workspaceName: String? = null

    for (element in resources) {
      val res = element.obj() ?: continue
      when (res["_type"].str()) {
        "workspace" -> {
          workspaceId = res["_id"].str() ?: ""
          workspaceName = res["name"].str()
        }
        "request", "request_group" -> {
          val parent = res["parentId"].str() ?: ""
          byParent.getOrPut(parent) { mutableListOf() }.add(res)
        }
      }
    }

    return ModelFactory.collection(workspaceName ?: "Insomnia Import")
      .copy(children = buildInsomniaChildren(workspaceId, byParent))
  }

  private fun buildInsomniaChildren(
    parentId: String,
    byParent: Map<String, List<JsonObject>>,
  ): List<CollectionNode> = (byParent[parentId] ?: emptyList()).map { res ->
    val id = res["_id"].str() ?: ModelFactory.newId()
    if (res["_type"].str() == "request_group") {
      FolderNode(id = id, name = res["name"].str() ?: "Folder", children = buildInsomniaChildren(id, byParent))
    } else {
      val body = res["body"].obj()
      val mime = body?.get("mimeType").str()?.lowercase() ?: ""
      val requestBody = when {
        body == null -> RequestBody(mode = BodyMode.NONE)
        mime.contains("x-www-form-urlencoded") ->
          RequestBody(mode = BodyMode.URLENCODED, urlencoded = mapKeyValues(body["params"].arr(), "name", "value", "disabled"))
        body["text"].str() != null ->
          RequestBody(mode = BodyMode.RAW, raw = body["text"].str() ?: "", rawLanguage = languageForMime(mime))
        else -> RequestBody(mode = BodyMode.NONE)
      }
      val request = HttpRequest(
        method = res["method"].str() ?: "GET",
        url = res["url"].str() ?: "",
        headers = mapKeyValues(res["headers"].arr(), "name", "value", "disabled"),
        queryParams = mapKeyValues(res["parameters"].arr(), "name", "value", "disabled"),
        body = requestBody,
        auth = mapInsomniaAuth(res["authentication"].obj()),
      )
      RequestNode(id, res["name"].str() ?: request.url, RequestProtocol.HTTP, request)
    }
  }

  private fun mapInsomniaAuth(auth: JsonObject?): Auth {
    val obj = auth ?: return Auth()
    val type = obj["type"].str() ?: return Auth()
    return when (type) {
      "bearer" -> Auth(type = AuthType.BEARER, bearer = BearerAuth(obj["token"].str() ?: ""))
      "basic" -> Auth(
        type = AuthType.BASIC,
        basic = BasicAuth(obj["username"].str() ?: "", obj["password"].str() ?: ""),
      )
      "apikey" -> Auth(
        type = AuthType.APIKEY,
        apikey = ApiKeyAuth(obj["key"].str() ?: "", obj["value"].str() ?: "", ai.codesetu.apiclient.model.ApiKeyLocation.HEADER),
      )
      else -> Auth()
    }
  }

  // --- OpenAPI ---------------------------------------------------------------

  private fun importOpenApi(doc: JsonElement): Collection {
    val root = doc.obj() ?: return ModelFactory.collection("OpenAPI Import")
    val title = root["info"].obj()?.get("title").str() ?: "OpenAPI Import"
    val baseUrl = root["servers"].arr()?.firstOrNull().obj()?.get("url").str() ?: ""
    val folders = LinkedHashMap<String, MutableList<CollectionNode>>()
    val loose = mutableListOf<CollectionNode>()

    val paths = root["paths"].obj() ?: JsonObject(emptyMap())
    for ((path, pathItemElement) in paths) {
      val pathItem = pathItemElement.obj() ?: continue
      val pathParams = pathItem["parameters"].arr()
      for (method in httpMethods) {
        val operation = pathItem[method].obj() ?: continue
        val node = buildOpenApiRequest(method, path, baseUrl, operation, pathParams)
        val tag = operation["tags"].arr()?.firstOrNull().str()
        if (tag != null) {
          folders.getOrPut(tag) { mutableListOf() }.add(node)
        } else {
          loose.add(node)
        }
      }
    }

    val children = folders.map { (tag, items) ->
      FolderNode(ModelFactory.newId(), tag, children = items)
    } + loose
    return ModelFactory.collection(title).copy(children = children)
  }

  private fun buildOpenApiRequest(
    method: String,
    path: String,
    baseUrl: String,
    operation: JsonObject,
    pathParams: JsonArray?,
  ): RequestNode {
    val parameters = (pathParams ?: JsonArray(emptyList())) + (operation["parameters"].arr() ?: JsonArray(emptyList()))
    val query = parameters.mapNotNull { it.obj() }.filter { it["in"].str() == "query" }.map { paramToKeyValue(it) }
    val headers = parameters.mapNotNull { it.obj() }.filter { it["in"].str() == "header" }.map { paramToKeyValue(it) }
    val pathVariables = parameters.mapNotNull { it.obj() }.filter { it["in"].str() == "path" }
      .map { KeyValue(it["name"].str() ?: "", paramExample(it), true) }

    val jsonContent = operation["requestBody"].obj()?.get("content").obj()?.get("application/json").obj()
    val body = if (jsonContent != null) {
      val example = jsonContent["example"] ?: jsonContent["schema"].obj()?.get("example")
      RequestBody(mode = BodyMode.RAW, rawLanguage = RawLanguage.JSON, raw = if (example == null) "{}" else json.encodeToString(JsonElement.serializer(), example))
    } else {
      RequestBody(mode = BodyMode.NONE)
    }

    val request = HttpRequest(
      method = method.uppercase(),
      url = trimTrailingSlash(baseUrl) + convertPath(path),
      queryParams = query,
      headers = headers,
      pathVariables = pathVariables,
      body = body,
    )
    val name = operation["operationId"].str() ?: operation["summary"].str() ?: "${request.method} $path"
    return RequestNode(ModelFactory.newId(), name, RequestProtocol.HTTP, request)
  }

  private fun paramToKeyValue(param: JsonObject): KeyValue =
    KeyValue(param["name"].str() ?: "", paramExample(param), param["required"].bool() == true)

  private fun paramExample(param: JsonObject): String {
    val value = param["example"] ?: param["schema"].obj()?.get("example") ?: param["schema"].obj()?.get("default")
    return when (value) {
      null, is JsonNull -> ""
      is JsonPrimitive -> value.contentOrNull ?: ""
      else -> json.encodeToString(JsonElement.serializer(), value)
    }
  }

  private fun convertPath(path: String): String = path.replace(Regex("\\{([^}]+)}"), ":$1")

  private fun trimTrailingSlash(url: String): String = url.trimEnd('/')

  // --- Shared helpers --------------------------------------------------------

  private fun mapKeyValues(
    array: JsonArray?,
    keyField: String,
    valueField: String,
    disabledField: String?,
  ): List<KeyValue> = (array ?: JsonArray(emptyList())).mapNotNull { element ->
    val obj = element.obj() ?: return@mapNotNull null
    val enabled = if (disabledField == null) true else obj[disabledField].bool() != true
    KeyValue(obj[keyField].str() ?: "", obj[valueField].str() ?: "", enabled)
  }

  private fun mapLanguage(language: String?): RawLanguage = when (language) {
    "json" -> RawLanguage.JSON
    "xml" -> RawLanguage.XML
    "html" -> RawLanguage.HTML
    "javascript" -> RawLanguage.JAVASCRIPT
    else -> RawLanguage.TEXT
  }

  private fun languageForMime(mime: String): RawLanguage = when {
    mime.contains("json") -> RawLanguage.JSON
    mime.contains("xml") -> RawLanguage.XML
    mime.contains("html") -> RawLanguage.HTML
    else -> RawLanguage.TEXT
  }

  private fun stripQuery(url: String): String {
    val index = url.indexOf("?")
    return if (index == -1) url else url.substring(0, index)
  }

  private fun parseDoc(text: String): JsonElement =
    runCatching { json.parseToJsonElement(text) }.getOrElse {
      runCatching { anyToJson(Yaml().load<Any?>(text)) }.getOrElse {
        throw IllegalArgumentException("Could not parse the import as JSON or YAML.")
      }
    }

  private fun anyToJson(value: Any?): JsonElement = when (value) {
    null -> JsonNull
    is Map<*, *> -> JsonObject(value.entries.associate { (it.key.toString()) to anyToJson(it.value) })
    is List<*> -> JsonArray(value.map { anyToJson(it) })
    is Boolean -> JsonPrimitive(value)
    is Number -> JsonPrimitive(value)
    else -> JsonPrimitive(value.toString())
  }

  // JsonElement navigation helpers.
  private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
  private fun JsonElement?.arr(): JsonArray? = this as? JsonArray
  private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.contentOrNull
  private fun JsonElement?.bool(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull
}
