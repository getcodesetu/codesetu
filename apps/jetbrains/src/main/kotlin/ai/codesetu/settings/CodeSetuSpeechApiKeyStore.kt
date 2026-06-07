/*
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
package ai.codesetu.settings

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe

/**
 * Separate credential entry for the speech provider (Sarvam Saaras/Bulbul,
 * OpenAI-compatible Whisper, Hugging Face). Saaras keys are distinct from chat
 * keys at Sarvam, so we keep these in their own slot.
 */
object CodeSetuSpeechApiKeyStore {
  private val attributes: CredentialAttributes =
    CredentialAttributes(generateServiceName("CodeSetu", "speechApiKey"))

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
