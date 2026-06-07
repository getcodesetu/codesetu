/*
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Adds the CEF runtime flags required for the chat webview's mic button to
 * work in JCEF. Registered via the `com.intellij.jbCefAppRequiredArgumentsProvider`
 * extension point — IntelliJ collects these from every plugin at JCEF init.
 *
 * Why these specific flags:
 *  - --enable-features=WebRTC,MediaStream,AudioServiceOutOfProcess
 *      Turns on the media-stream subsystem in CEF. Without this, the page-side
 *      `navigator.mediaDevices.getUserMedia` resolver throws "NotSupportedError"
 *      before the user is ever prompted.
 *  - --use-fake-ui-for-media-stream
 *      Auto-grants getUserMedia requests at the CEF layer. This is required
 *      because the bundled JCEF in IntelliJ does not surface an interactive
 *      permission prompt for mic/camera. The OS-level mic permission (macOS
 *      "Microphone access", Windows privacy settings) still gates physical
 *      access, so the user is not bypassed completely — they get the OS prompt
 *      the first time. The trade-off is documented in the JetBrains README.
 *
 * Scope: these flags apply to ALL JCEF webviews in the IDE process, not just
 * CodeSetu's. We accept this because (a) the user only triggers mic capture
 * by explicitly clicking our mic button — no silent surveillance, and (b)
 * other plugins using JCEF for chat-like flows benefit equally.
 */
package ai.codesetu.toolwindow

import com.intellij.ui.jcef.JBCefAppRequiredArgumentsProvider

class CodeSetuJBCefArgsProvider : JBCefAppRequiredArgumentsProvider {
  override val options: List<String> = listOf(
    "--enable-features=WebRTC,MediaStream,AudioServiceOutOfProcess",
    "--use-fake-ui-for-media-stream",
  )
}
