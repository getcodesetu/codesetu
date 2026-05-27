package ai.codesetu.apiclient

import ai.codesetu.apiclient.engine.AuthApplier
import ai.codesetu.apiclient.engine.HttpEngine
import ai.codesetu.apiclient.engine.VariableResolver
import ai.codesetu.apiclient.model.Auth
import ai.codesetu.apiclient.model.AuthType
import ai.codesetu.apiclient.model.BasicAuth
import ai.codesetu.apiclient.model.BearerAuth
import ai.codesetu.apiclient.model.HttpRequest
import ai.codesetu.apiclient.model.RequestBody
import ai.codesetu.apiclient.model.BodyMode
import ai.codesetu.apiclient.model.RawLanguage
import ai.codesetu.apiclient.model.Variable
import ai.codesetu.apiclient.model.VariableScope
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.Base64
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EngineTest {
  private lateinit var server: HttpServer
  private var baseUrl = ""

  @BeforeTest
  fun start() {
    server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/redirect") { exchange ->
      exchange.responseHeaders.add("Location", "/target")
      exchange.sendResponseHeaders(302, -1)
      exchange.close()
    }
    server.createContext("/target") { exchange ->
      val body = "{\"ok\":true}".toByteArray()
      exchange.responseHeaders.add("Content-Type", "application/json")
      exchange.sendResponseHeaders(200, body.size.toLong())
      exchange.responseBody.use { it.write(body) }
    }
    server.createContext("/echo") { exchange ->
      val requestBody = exchange.requestBody.readBytes()
      val auth = exchange.requestHeaders.getFirst("Authorization") ?: "null"
      val payload =
        "{\"method\":\"${exchange.requestMethod}\",\"auth\":\"$auth\",\"body\":${quote(String(requestBody))}}"
          .toByteArray()
      exchange.responseHeaders.add("Content-Type", "application/json")
      exchange.sendResponseHeaders(200, payload.size.toLong())
      exchange.responseBody.use { it.write(payload) }
    }
    server.start()
    baseUrl = "http://127.0.0.1:${server.address.port}"
  }

  @AfterTest
  fun stop() {
    server.stop(0)
  }

  @Test
  fun resolvesEnvironmentPrecedence() {
    val out = VariableResolver.resolve(
      "{{base}}/{{path}}",
      VariableScope(
        globals = listOf(Variable("base", "https://global")),
        collection = listOf(Variable("base", "https://collection")),
        environment = listOf(Variable("base", "https://env"), Variable("path", "users")),
      ),
    )
    assertEquals("https://env/users", out)
  }

  @Test
  fun buildsBasicAuthHeader() {
    val result = AuthApplier.apply(Auth(type = AuthType.BASIC, basic = BasicAuth("user", "pass")))
    val expected = "Basic " + Base64.getEncoder().encodeToString("user:pass".toByteArray())
    assertEquals("Authorization", result.headers[0].first)
    assertEquals(expected, result.headers[0].second)
  }

  @Test
  fun executesGetRequest() {
    val response = HttpEngine().execute(
      HttpRequest(method = "GET", url = "$baseUrl/echo"),
      VariableScope(),
    )
    assertEquals(200, response.status)
    assertTrue(response.ok)
    assertTrue(response.bodyText.contains("\"method\":\"GET\""))
  }

  @Test
  fun sendsBodyWithBearerAuth() {
    val response = HttpEngine().execute(
      HttpRequest(
        method = "POST",
        url = "$baseUrl/echo",
        auth = Auth(type = AuthType.BEARER, bearer = BearerAuth("abc123")),
        body = RequestBody(mode = BodyMode.RAW, rawLanguage = RawLanguage.JSON, raw = "{\"hello\":\"world\"}"),
      ),
      VariableScope(),
    )
    assertTrue(response.bodyText.contains("\"auth\":\"Bearer abc123\""))
    assertTrue(response.bodyText.contains("hello"))
  }

  @Test
  fun followsRedirects() {
    val response = HttpEngine().execute(
      HttpRequest(method = "GET", url = "$baseUrl/redirect"),
      VariableScope(),
    )
    assertEquals(200, response.status)
    assertTrue(response.redirected)
    assertTrue(response.finalUrl.endsWith("/target"))
  }

  private fun quote(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
