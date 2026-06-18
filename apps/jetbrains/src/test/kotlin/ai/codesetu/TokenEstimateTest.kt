package ai.codesetu

import ai.codesetu.context.estimateTokens
import ai.codesetu.context.estimateTokensForParts
import kotlin.test.Test
import kotlin.test.assertEquals

class TokenEstimateTest {
  @Test
  fun `empty string is zero tokens`() {
    assertEquals(0, estimateTokens(""))
  }

  @Test
  fun `rounds up to whole tokens at four chars each`() {
    assertEquals(1, estimateTokens("a"))
    assertEquals(1, estimateTokens("abcd"))
    assertEquals(2, estimateTokens("abcde"))
  }

  @Test
  fun `sums parts ignoring empties`() {
    assertEquals(2, estimateTokensForParts(listOf("abcd", "abcd", "")))
    assertEquals(4, estimateTokensForParts(listOf("abcde", "abcde")))
  }
}
