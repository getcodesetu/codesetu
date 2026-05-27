package ai.codesetu.apiclient.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Kotlin mirror of packages/api-client-core/src/model.ts. Keep these shapes in
 * sync with the TypeScript model — both describe the same API Client data.
 */

@Serializable
data class KeyValue(
  val key: String = "",
  val value: String = "",
  val enabled: Boolean = true,
  val description: String? = null,
)

@Serializable
enum class BodyMode {
  @SerialName("none") NONE,
  @SerialName("raw") RAW,
  @SerialName("urlencoded") URLENCODED,
  @SerialName("form-data") FORM_DATA,
  @SerialName("binary") BINARY,
  @SerialName("graphql") GRAPHQL,
}

@Serializable
enum class RawLanguage {
  @SerialName("json") JSON,
  @SerialName("text") TEXT,
  @SerialName("xml") XML,
  @SerialName("html") HTML,
  @SerialName("javascript") JAVASCRIPT,
}

@Serializable
enum class FormFieldKind {
  @SerialName("text") TEXT,
  @SerialName("file") FILE,
}

@Serializable
data class FormDataField(
  val key: String = "",
  val kind: FormFieldKind = FormFieldKind.TEXT,
  val value: String? = null,
  val filePath: String? = null,
  val contentType: String? = null,
  val enabled: Boolean = true,
  val description: String? = null,
)

@Serializable
data class GraphQlBody(val query: String = "", val variables: String? = null)

@Serializable
data class RequestBody(
  val mode: BodyMode = BodyMode.NONE,
  val raw: String? = null,
  val rawLanguage: RawLanguage? = null,
  val formData: List<FormDataField> = emptyList(),
  val urlencoded: List<KeyValue> = emptyList(),
  val binaryFilePath: String? = null,
  val graphql: GraphQlBody? = null,
)

@Serializable
enum class AuthType {
  @SerialName("none") NONE,
  @SerialName("inherit") INHERIT,
  @SerialName("bearer") BEARER,
  @SerialName("basic") BASIC,
  @SerialName("apikey") APIKEY,
  @SerialName("oauth2") OAUTH2,
}

@Serializable
enum class ApiKeyLocation {
  @SerialName("header") HEADER,
  @SerialName("query") QUERY,
}

@Serializable
data class BasicAuth(val username: String = "", val password: String = "")

@Serializable
data class BearerAuth(val token: String = "")

@Serializable
data class ApiKeyAuth(
  val key: String = "",
  val value: String = "",
  val location: ApiKeyLocation = ApiKeyLocation.HEADER,
)

@Serializable
data class OAuth2Auth(val accessToken: String = "", val headerPrefix: String = "Bearer")

@Serializable
data class Auth(
  val type: AuthType = AuthType.NONE,
  val basic: BasicAuth? = null,
  val bearer: BearerAuth? = null,
  val apikey: ApiKeyAuth? = null,
  val oauth2: OAuth2Auth? = null,
)

@Serializable
data class RequestScripts(val preRequest: String? = null, val test: String? = null)

@Serializable
data class RequestSettings(
  val followRedirects: Boolean = true,
  val maxRedirects: Int = 10,
  val timeoutMs: Long = 30_000,
  val verifyTls: Boolean = true,
  val encodeUrl: Boolean = true,
)

@Serializable
data class HttpRequest(
  val method: String = "GET",
  val url: String = "",
  val queryParams: List<KeyValue> = emptyList(),
  val pathVariables: List<KeyValue> = emptyList(),
  val headers: List<KeyValue> = emptyList(),
  val body: RequestBody = RequestBody(),
  val auth: Auth = Auth(),
  val scripts: RequestScripts = RequestScripts(),
  val settings: RequestSettings = RequestSettings(),
)

@Serializable
enum class WebSocketMessageFormat {
  @SerialName("text") TEXT,
  @SerialName("json") JSON,
  @SerialName("binary") BINARY,
}

@Serializable
data class WebSocketSavedMessage(
  val id: String,
  val name: String? = null,
  val body: String = "",
  val format: WebSocketMessageFormat = WebSocketMessageFormat.TEXT,
)

@Serializable
data class WebSocketRequest(
  val url: String = "",
  val protocols: List<String> = emptyList(),
  val headers: List<KeyValue> = emptyList(),
  val auth: Auth = Auth(),
  val savedMessages: List<WebSocketSavedMessage> = emptyList(),
)

@Serializable
enum class RequestProtocol {
  @SerialName("http") HTTP,
  @SerialName("websocket") WEBSOCKET,
}

@Serializable
sealed class CollectionNode {
  abstract val id: String
  abstract val name: String
}

@Serializable
@SerialName("request")
data class RequestNode(
  override val id: String,
  override val name: String,
  val protocol: RequestProtocol = RequestProtocol.HTTP,
  val http: HttpRequest? = HttpRequest(),
  val websocket: WebSocketRequest? = null,
  val description: String? = null,
) : CollectionNode()

@Serializable
@SerialName("folder")
data class FolderNode(
  override val id: String,
  override val name: String,
  val auth: Auth? = null,
  val children: List<CollectionNode> = emptyList(),
  val description: String? = null,
) : CollectionNode()

@Serializable
data class Variable(
  val key: String = "",
  val value: String = "",
  val enabled: Boolean = true,
  val secret: Boolean = false,
  val description: String? = null,
)

@Serializable
data class Collection(
  val id: String,
  val name: String,
  val description: String? = null,
  val variables: List<Variable> = emptyList(),
  val auth: Auth = Auth(),
  val children: List<CollectionNode> = emptyList(),
)

@Serializable
data class Environment(val id: String, val name: String, val variables: List<Variable> = emptyList())

@Serializable
data class ResponseTimings(val startedAt: Long, val durationMs: Long)

@Serializable
data class ResponseCookie(
  val name: String,
  val value: String,
  val domain: String? = null,
  val path: String? = null,
  val expires: String? = null,
  val maxAge: Long? = null,
  val httpOnly: Boolean = false,
  val secure: Boolean = false,
  val sameSite: String? = null,
)

@Serializable
data class TestResult(val name: String, val passed: Boolean, val error: String? = null)

@Serializable
data class HttpResponse(
  val status: Int,
  val statusText: String,
  val ok: Boolean,
  val headers: List<KeyValue>,
  val cookies: List<ResponseCookie>,
  val bodyText: String,
  val bodyBase64: String? = null,
  val contentType: String? = null,
  val sizeBytes: Long,
  val timings: ResponseTimings,
  val redirected: Boolean,
  val finalUrl: String,
  val testResults: List<TestResult> = emptyList(),
)

/**
 * Variable lookup scopes, applied in increasing precedence:
 * globals < collection < environment < local. Runtime-only (not persisted).
 */
data class VariableScope(
  val globals: List<Variable> = emptyList(),
  val collection: List<Variable> = emptyList(),
  val environment: List<Variable> = emptyList(),
  val local: Map<String, String> = emptyMap(),
)
