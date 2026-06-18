package ai.codesetu

import ai.codesetu.completion.buildFimContext
import kotlin.test.Test
import kotlin.test.assertEquals

class FimContextTest {
  @Test
  fun `splits text at the caret offset`() {
    val fim = buildFimContext("abcdef", offset = 3, maxPrefixChars = 100, maxSuffixChars = 100)
    assertEquals("abc", fim.prompt)
    assertEquals("def", fim.suffix)
  }

  @Test
  fun `bounds the prefix to the most recent characters`() {
    val fim = buildFimContext("abcdefghij", offset = 10, maxPrefixChars = 4, maxSuffixChars = 100)
    assertEquals("ghij", fim.prompt)
    assertEquals("", fim.suffix)
  }

  @Test
  fun `bounds the suffix to the leading characters`() {
    val fim = buildFimContext("abcdefghij", offset = 0, maxPrefixChars = 100, maxSuffixChars = 3)
    assertEquals("", fim.prompt)
    assertEquals("abc", fim.suffix)
  }

  @Test
  fun `clamps an out-of-range offset`() {
    val past = buildFimContext("abc", offset = 99, maxPrefixChars = 100, maxSuffixChars = 100)
    assertEquals("abc", past.prompt)
    assertEquals("", past.suffix)

    val negative = buildFimContext("abc", offset = -5, maxPrefixChars = 100, maxSuffixChars = 100)
    assertEquals("", negative.prompt)
    assertEquals("abc", negative.suffix)
  }
}
