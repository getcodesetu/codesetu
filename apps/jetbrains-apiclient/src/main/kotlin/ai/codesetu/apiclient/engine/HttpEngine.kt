package ai.codesetu.apiclient.engine

import ai.codesetu.apiclient.model.ApiKeyAuth
import ai.codesetu.apiclient.model.Auth
import ai.codesetu.apiclient.model.AuthType
import ai.codesetu.apiclient.model.BasicAuth
import ai.codesetu.apiclient.model.BearerAuth
import ai.codesetu.apiclient.model.HttpRequest
import ai.codesetu.apiclient.model.HttpResponse
import ai.codesetu.apiclient.model.KeyValue
import ai.codesetu.apiclient.model.OAuth2Auth
import ai.codesetu.apiclient.model.ResponseTimings
import ai.codesetu.apiclient.model.VariableScope
import java.io.File
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest as JdkRequest
import java.net.http.HttpResponse as JdkResponse
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.time.Duration
import java.util.Base64
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLParameters
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** Kotlin mirror of packages/api-client-core/src/engine/http.ts (uses java.net.http). */
class HttpEngine(
  private val fileReader: (String) -> ByteArray = { File(it).readBytes() },
) {
  private val schemePattern = Regex("^[a-zA-Z][a-zA-Z0-9+.\\-]*://")
  private val restrictedHeaders = setOf(
    "connection", "content-length", "expect", "host", "upgrade", "transfer-encoding",
  )

  fun execute(request: HttpRequest, scope: VariableScope, inheritedAuth: Auth? = null): HttpResponse {
    val startedAt = System.currentTimeMillis()
    val nanoStart = System.nanoTime()

    val auth = resolveAuth(effectiveAuth(request.auth, inheritedAuth), scope)
    val application = AuthApplier.apply(auth)

    val uri = buildUri(request, scope, application.queryParams)
    val headers = buildHeaders(request, scope, application.headers)
    val built = BodyBuilder.build(resolveBody(request, scope), fileReader)
    if (built.contentType != null && headers.none { it.first.equals("content-type", ignoreCase = true) }) {
      headers += "Content-Type" to built.contentType
    }

    val client = buildClient(request)
    val builder = JdkRequest.newBuilder(uri)
    if (request.settings.timeoutMs > 0) {
      builder.timeout(Duration.ofMillis(request.settings.timeoutMs))
    }
    for ((key, value) in headers) {
      if (key.lowercase() !in restrictedHeaders) {
        builder.header(key, value)
      }
    }
    val publisher =
      if (built.bytes != null) JdkRequest.BodyPublishers.ofByteArray(built.bytes)
      else JdkRequest.BodyPublishers.noBody()
    builder.method(request.method.uppercase(), publisher)

    val response = client.send(builder.build(), JdkResponse.BodyHandlers.ofByteArray())
    val durationMs = (System.nanoTime() - nanoStart) / 1_000_000

    return decode(response, uri, ResponseTimings(startedAt, durationMs))
  }

  private fun decode(
    response: JdkResponse<ByteArray>,
    requestUri: URI,
    timings: ResponseTimings,
  ): HttpResponse {
    val headers = mutableListOf<KeyValue>()
    response.headers().map().forEach { (key, values) ->
      values.forEach { headers += KeyValue(key, it, enabled = true) }
    }
    val contentType = response.headers().firstValue("content-type").orElse(null)
    val bytes = response.body()
    val textual = ContentType.isTextual(contentType)

    return HttpResponse(
      status = response.statusCode(),
      statusText = reasonPhrase(response.statusCode()),
      ok = response.statusCode() in 200..299,
      headers = headers,
      cookies = CookieParser.parseAll(response.headers().allValues("set-cookie")),
      bodyText = if (textual) String(bytes, Charsets.UTF_8) else "",
      bodyBase64 = if (textual) null else Base64.getEncoder().encodeToString(bytes),
      contentType = contentType?.let { ContentType.mimeOf(it) },
      sizeBytes = bytes.size.toLong(),
      timings = timings,
      redirected = response.uri().toString() != requestUri.toString(),
      finalUrl = response.uri().toString(),
    )
  }

  private fun buildClient(request: HttpRequest): HttpClient {
    val builder = HttpClient.newBuilder()
      .followRedirects(
        if (request.settings.followRedirects) HttpClient.Redirect.NORMAL
        else HttpClient.Redirect.NEVER,
      )
      .connectTimeout(Duration.ofMillis(if (request.settings.timeoutMs > 0) request.settings.timeoutMs else 30_000))

    if (!request.settings.verifyTls) {
      val context = SSLContext.getInstance("TLS")
      context.init(null, arrayOf<TrustManager>(TRUST_ALL), SecureRandom())
      val params = SSLParameters().apply { endpointIdentificationAlgorithm = null }
      builder.sslContext(context).sslParameters(params)
    }
    return builder.build()
  }

  private fun buildUri(
    request: HttpRequest,
    scope: VariableScope,
    authQuery: List<Pair<String, String>>,
  ): URI {
    var raw = VariableResolver.resolve(request.url, scope).trim()
    for (pathVar in request.pathVariables) {
      if (!pathVar.enabled || pathVar.key.isEmpty()) continue
      val value = urlEncode(VariableResolver.resolve(pathVar.value, scope))
      raw = raw.replace(Regex(":${Regex.escape(pathVar.key)}(?=/|$|\\?)"), value)
    }
    if (!schemePattern.containsMatchIn(raw)) {
      raw = "http://$raw"
    }

    val params = mutableListOf<Pair<String, String>>()
    for (param in request.queryParams) {
      if (param.enabled && param.key.isNotEmpty()) {
        params += VariableResolver.resolve(param.key, scope) to VariableResolver.resolve(param.value, scope)
      }
    }
    params += authQuery

    val builder = StringBuilder(raw)
    if (params.isNotEmpty()) {
      builder.append(if (raw.contains("?")) "&" else "?")
      builder.append(params.joinToString("&") { "${urlEncode(it.first)}=${urlEncode(it.second)}" })
    }
    return URI.create(builder.toString())
  }

  private fun buildHeaders(
    request: HttpRequest,
    scope: VariableScope,
    authHeaders: List<Pair<String, String>>,
  ): MutableList<Pair<String, String>> {
    val headers = mutableListOf<Pair<String, String>>()
    for (header in request.headers) {
      if (header.enabled && header.key.isNotEmpty()) {
        headers += VariableResolver.resolve(header.key, scope) to VariableResolver.resolve(header.value, scope)
      }
    }
    headers += authHeaders
    return headers
  }

  private fun resolveBody(request: HttpRequest, scope: VariableScope) = request.body.copy(
    raw = request.body.raw?.let { VariableResolver.resolve(it, scope) },
    urlencoded = request.body.urlencoded.map {
      it.copy(
        key = VariableResolver.resolve(it.key, scope),
        value = VariableResolver.resolve(it.value, scope),
      )
    },
    formData = request.body.formData.map {
      it.copy(
        key = VariableResolver.resolve(it.key, scope),
        value = it.value?.let { value -> VariableResolver.resolve(value, scope) },
      )
    },
    graphql = request.body.graphql?.let { graphql ->
      graphql.copy(
        query = VariableResolver.resolve(graphql.query, scope),
        variables = graphql.variables?.let { VariableResolver.resolve(it, scope) },
      )
    },
  )

  private fun effectiveAuth(requestAuth: Auth, inherited: Auth?): Auth =
    if (requestAuth.type == AuthType.INHERIT && inherited != null) inherited else requestAuth

  private fun resolveAuth(auth: Auth, scope: VariableScope): Auth = auth.copy(
    basic = auth.basic?.let {
      BasicAuth(VariableResolver.resolve(it.username, scope), VariableResolver.resolve(it.password, scope))
    },
    bearer = auth.bearer?.let { BearerAuth(VariableResolver.resolve(it.token, scope)) },
    apikey = auth.apikey?.let {
      ApiKeyAuth(
        VariableResolver.resolve(it.key, scope),
        VariableResolver.resolve(it.value, scope),
        it.location,
      )
    },
    oauth2 = auth.oauth2?.let {
      OAuth2Auth(VariableResolver.resolve(it.accessToken, scope), it.headerPrefix)
    },
  )

  private fun urlEncode(value: String): String = URLEncoder.encode(value, "UTF-8")

  private companion object {
    val TRUST_ALL: X509TrustManager = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
      override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    fun reasonPhrase(status: Int): String = when (status) {
      200 -> "OK"
      201 -> "Created"
      202 -> "Accepted"
      204 -> "No Content"
      301 -> "Moved Permanently"
      302 -> "Found"
      304 -> "Not Modified"
      400 -> "Bad Request"
      401 -> "Unauthorized"
      403 -> "Forbidden"
      404 -> "Not Found"
      405 -> "Method Not Allowed"
      409 -> "Conflict"
      422 -> "Unprocessable Entity"
      429 -> "Too Many Requests"
      500 -> "Internal Server Error"
      502 -> "Bad Gateway"
      503 -> "Service Unavailable"
      504 -> "Gateway Timeout"
      else -> ""
    }
  }
}
