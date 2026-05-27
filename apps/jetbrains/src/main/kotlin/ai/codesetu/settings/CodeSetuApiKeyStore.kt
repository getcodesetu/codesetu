package ai.codesetu.settings

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe

/**
 * Stores the CodeSetu provider API key in the IDE's [PasswordSafe] (OS keychain
 * / encrypted credential store) instead of the plaintext settings XML.
 */
object CodeSetuApiKeyStore {
  private val attributes: CredentialAttributes =
    CredentialAttributes(generateServiceName("CodeSetu", "apiKey"))

  fun get(): String = PasswordSafe.instance.getPassword(attributes).orEmpty()

  fun set(value: String) {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) {
      PasswordSafe.instance.set(attributes, null)
    } else {
      PasswordSafe.instance.set(attributes, Credentials(null, trimmed))
    }
  }
}
