package ai.codesetu.apiclient.engine

import ai.codesetu.apiclient.model.ApiKeyLocation
import ai.codesetu.apiclient.model.Auth
import ai.codesetu.apiclient.model.AuthType
import java.util.Base64

data class AuthApplication(
  val headers: List<Pair<String, String>>,
  val queryParams: List<Pair<String, String>>,
)

/** Kotlin mirror of packages/api-client-core/src/engine/auth.ts. */
object AuthApplier {
  fun apply(auth: Auth): AuthApplication {
    val headers = mutableListOf<Pair<String, String>>()
    val queryParams = mutableListOf<Pair<String, String>>()

    when (auth.type) {
      AuthType.BEARER -> {
        val token = auth.bearer?.token.orEmpty()
        if (token.isNotEmpty()) {
          headers += "Authorization" to "Bearer $token"
        }
      }
      AuthType.BASIC -> {
        val username = auth.basic?.username.orEmpty()
        val password = auth.basic?.password.orEmpty()
        val encoded = Base64.getEncoder().encodeToString("$username:$password".toByteArray(Charsets.UTF_8))
        headers += "Authorization" to "Basic $encoded"
      }
      AuthType.APIKEY -> {
        val key = auth.apikey?.key.orEmpty()
        val value = auth.apikey?.value.orEmpty()
        if (key.isNotEmpty()) {
          if (auth.apikey?.location == ApiKeyLocation.QUERY) {
            queryParams += key to value
          } else {
            headers += key to value
          }
        }
      }
      AuthType.OAUTH2 -> {
        val token = auth.oauth2?.accessToken.orEmpty()
        if (token.isNotEmpty()) {
          val prefix = auth.oauth2?.headerPrefix.orEmpty().ifEmpty { "Bearer" }
          headers += "Authorization" to "$prefix $token"
        }
      }
      AuthType.NONE, AuthType.INHERIT -> Unit
    }

    return AuthApplication(headers, queryParams)
  }
}
