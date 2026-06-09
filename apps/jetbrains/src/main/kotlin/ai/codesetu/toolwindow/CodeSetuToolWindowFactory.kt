package ai.codesetu.toolwindow

import ai.codesetu.actions.SetupSpeechProviderAction
import ai.codesetu.agent.AGENT_MODE_SYSTEM_NOTE
import ai.codesetu.agent.AgentEvent
import ai.codesetu.agent.ApprovalDecision
import ai.codesetu.agent.ApprovalRequest
import ai.codesetu.agent.IntellijAgentHost
import ai.codesetu.agent.defaultAgentTools
import ai.codesetu.agent.runAgentLoop
import ai.codesetu.agent.sanitizeToolMessages
import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.ChatMessage
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.model.WorkspaceInstruction
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.prompts.PLAN_MODE_SKILL_ID
import ai.codesetu.prompts.buildContextMarkdown
import ai.codesetu.prompts.buildSystemMessage
import ai.codesetu.prompts.isPlanModeApproval
import ai.codesetu.settings.CodeSetuModelCatalog
import ai.codesetu.settings.CodeSetuSettingsState
import ai.codesetu.settings.providerDefaults
import ai.codesetu.settings.resolveCodeSetuModel
import ai.codesetu.skills.loadBuiltinSkills
import ai.codesetu.skills.routeSkills
import ai.codesetu.speech.AudioPayload
import ai.codesetu.speech.CodeSetuSpeechClient
import java.util.Base64
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import javax.swing.JComponent
import javax.swing.JLabel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

class CodeSetuToolWindowFactory : ToolWindowFactory {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val contentFactory = ContentFactory.getInstance()

    if (!JBCefApp.isSupported()) {
      val fallback = JLabel("CodeSetu chat requires JCEF, which is unavailable in this IDE.")
      toolWindow.contentManager.addContent(contentFactory.createContent(fallback, "", false))
      return
    }

    val panel = CodeSetuChatPanel(project)
    CodeSetuChatService.getInstance(project).register(panel)
    val content = contentFactory.createContent(panel.component, "", false)
    content.setDisposer(panel)
    toolWindow.contentManager.addContent(content)
  }
}

/**
 * JCEF-backed chat panel that renders the shared CodeSetu chat design (the same
 * markup, CSS, and markdown rendering as the VS Code webview). Communication
 * uses a JBCefJSQuery bridge: the page posts sendMessage/selectModel/ready, and
 * the host pushes streamed deltas, the model label, busy state, and errors back.
 */
class CodeSetuChatPanel(private val project: Project) : Disposable {
  private val browser = JBCefBrowser()
  private val jsQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
  private val client = CodeSetuProviderClient()
  private val speechClient = CodeSetuSpeechClient()
  private val history = mutableListOf<ChatMessage>()

  // EDT-only state: outgoing messages buffered until the page signals "ready".
  private val pending = mutableListOf<String>()
  private var ready = false
  private var inFlight = false

  val component: JComponent
    get() = browser.component

  init {
    jsQuery.addHandler { request ->
      handlePost(request)
      null
    }
    browser.loadHTML(ChatWebviewHtml.render(modelLabelText(), jsQuery.inject("payload")))
  }

  /** Entry point for editor actions (Explain/Refactor/...) with pre-captured context. */
  fun sendMessage(text: String, capturedIdeContext: IdeContextPayload? = null) {
    // Editor actions inherit the user's current Plan / Agent Mode pick from settings.
    val settings = CodeSetuSettingsState.getInstance().state
    runChat(
      text,
      includeContext = true,
      captured = capturedIdeContext,
      planMode = settings.chatPlanModeOn,
      agentMode = settings.chatAgentModeOn,
    )
  }

  private fun handlePost(request: String) {
    val obj = try {
      Json.parseToJsonElement(request).jsonObject
    } catch (error: Exception) {
      return
    }

    when (obj["type"]?.jsonPrimitive?.contentOrNull) {
      "ready" -> onReady()
      "selectModel" -> showModelPicker()
      "configureProvider" -> ApplicationManager.getApplication().invokeLater { configureProvider() }
      "openUrl" -> {
        val url = obj["url"]?.jsonPrimitive?.contentOrNull ?: return
        ApplicationManager.getApplication().invokeLater { BrowserUtil.browse(url) }
      }
      "sendMessage" -> {
        val text = obj["text"]?.jsonPrimitive?.contentOrNull ?: return
        val include = obj["includeIdeContext"]?.jsonPrimitive?.booleanOrNull ?: true
        val settings = CodeSetuSettingsState.getInstance().state
        val planMode = obj["planMode"]?.jsonPrimitive?.booleanOrNull ?: settings.chatPlanModeOn
        val agentMode = obj["agentMode"]?.jsonPrimitive?.booleanOrNull ?: settings.chatAgentModeOn
        runChat(text, include, null, planMode, agentMode)
      }
      "uiState" -> {
        val state = CodeSetuSettingsState.getInstance().state
        obj["planMode"]?.jsonPrimitive?.booleanOrNull?.let { state.chatPlanModeOn = it }
        obj["agentMode"]?.jsonPrimitive?.booleanOrNull?.let { state.chatAgentModeOn = it }
      }
      "permissionDenied" -> {
        val reason = obj["reason"]?.jsonPrimitive?.contentOrNull ?: "other"
        val detail = obj["message"]?.jsonPrimitive?.contentOrNull
        ApplicationManager.getApplication().invokeLater {
          showMicPermissionPopup(reason, detail)
        }
      }
      "transcribe" -> {
        val requestId = obj["requestId"]?.jsonPrimitive?.contentOrNull ?: return
        val mimeType = obj["mimeType"]?.jsonPrimitive?.contentOrNull ?: "audio/webm"
        val base64 = obj["base64"]?.jsonPrimitive?.contentOrNull ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
          runTranscribe(requestId, mimeType, base64)
        }
      }
    }
  }

  private fun showMicPermissionPopup(reason: String, detail: String?) {
    val (title, body, settingsUrl) = micPermissionGuide(reason)
    val detailLine = if (detail.isNullOrBlank()) "" else "\n\n$detail"
    val full = "$body$detailLine"

    val options = if (settingsUrl != null) {
      arrayOf("Open Mic Settings", "Switch Speech Provider", "Dismiss")
    } else {
      arrayOf("Switch Speech Provider", "Dismiss")
    }
    val choice = Messages.showDialog(project, full, title, options, 0, Messages.getWarningIcon())
    val picked = options.getOrNull(choice)
    when (picked) {
      "Open Mic Settings" -> {
        if (settingsUrl != null) {
          // BrowserUtil handles custom URI schemes (x-apple.systempreferences,
          // ms-settings) via the platform's default URL handler.
          BrowserUtil.browse(settingsUrl)
        }
      }
      "Switch Speech Provider" -> SetupSpeechProviderAction.openWizard(project)
    }
  }

  private fun micPermissionGuide(reason: String): Triple<String, String, String?> = when (reason) {
    "no-device" -> Triple(
      "No microphone detected",
      "Plug in a microphone (or pick one as the system input device) and try again.",
      null,
    )
    "in-use" -> Triple(
      "Microphone is in use by another app",
      "Close any video-conferencing or recording app holding the mic and try again.",
      null,
    )
    "network" -> Triple(
      "Browser speech recognition needs network access",
      "Browser WebSpeech in JCEF cannot reach the Google recognition service (the embedded Chromium build ships without the cloud-speech keys). Run Tools → CodeSetu → Setup Speech Provider and pick Sarvam (or another server backend).",
      null,
    )
    "unsupported" -> Triple(
      "Mic capture is unavailable in this webview",
      "JCEF in this IDE build does not expose the media-stream API. Make sure you are on IntelliJ 2024+ and that the bundled JCEF is enabled (Help → Find Action → 'Choose Boot Runtime' → confirm a JBR with JCEF).",
      null,
    )
    else -> defaultPermissionGuide()
  }

  private fun defaultPermissionGuide(): Triple<String, String, String?> = when {
    SystemInfo.isMac -> Triple(
      "Microphone access blocked",
      "macOS is blocking the mic for this IDE.\n\nOpen System Settings → Privacy & Security → Microphone, then enable the row for IntelliJ IDEA (or PyCharm / WebStorm / whatever you launched).\n\nYou may need to quit and reopen the IDE after granting access.",
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    )
    SystemInfo.isWindows -> Triple(
      "Microphone access blocked",
      "Windows is blocking the mic for this IDE.\n\nOpen Settings → Privacy & Security → Microphone, turn on 'Microphone access' and 'Let desktop apps access your microphone', then come back.",
      "ms-settings:privacy-microphone",
    )
    else -> Triple(
      "Microphone access blocked",
      "Linux mic permissions depend on your audio server (PipeWire, PulseAudio) and on whether the IDE is sandboxed (Flatpak, Snap).\n\n • PulseAudio: run `pavucontrol` and check the Recording tab.\n • PipeWire: `wpctl status` to confirm the input source is unmuted.\n • Flatpak IntelliJ: `flatpak override --user --device=all com.jetbrains.IntelliJ-IDEA-Community` then restart.",
      null,
    )
  }

  private fun runTranscribe(requestId: String, mimeType: String, base64: String) {
    val state = CodeSetuSettingsState.getInstance().state
    val language = state.speechLanguage.ifBlank { "en-US" }
    try {
      val bytes = Base64.getDecoder().decode(base64)
      val result = speechClient.transcribe(AudioPayload(mimeType, bytes), language)
      push(
        message("transcription") {
          put("requestId", requestId)
          put("text", result.text)
          if (result.language != null) put("language", result.language)
        },
      )
    } catch (error: Exception) {
      push(
        message("speechError") {
          put("requestId", requestId)
          put("text", "Transcription failed: ${error.message ?: error}")
        },
      )
    }
  }


  private fun runChat(
    text: String,
    includeContext: Boolean,
    captured: IdeContextPayload?,
    planMode: Boolean = false,
    agentMode: Boolean = false,
  ) {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return

    ApplicationManager.getApplication().invokeLater {
      if (inFlight) return@invokeLater
      inFlight = true

      push(message("userMessage") { put("text", trimmed) })
      push(busy(true))

      // Capture editor context on the EDT before going to a background thread.
      val ideContext = captured ?: if (includeContext) collectIdeContext(project) else IdeContextPayload()

      ApplicationManager.getApplication().executeOnPooledThread {
        runRequest(trimmed, ideContext, planMode, agentMode)
      }
    }
  }

  private fun runRequest(
    userText: String,
    ideContext: IdeContextPayload,
    planMode: Boolean,
    agentMode: Boolean = false,
  ) {
    val instructions = ReadAction.compute<List<WorkspaceInstruction>, RuntimeException> {
      loadWorkspaceInstructions(project)
    }
    // Typing APPROVED / RUN (or hitting Approve & Run) drops plan-mode for this
    // turn even if the toggle is still on — the user wants implementation now.
    val planModeActive = planMode && !isPlanModeApproval(userText)
    val pinnedIds = if (planModeActive) listOf(PLAN_MODE_SKILL_ID) else emptyList()
    val autoRoute = CodeSetuSettingsState.getInstance().state.skillsAutoRoute
    val routed = routeSkills(
      userText = userText,
      skills = loadBuiltinSkills(),
      pinnedIds = pinnedIds,
      autoRoute = autoRoute,
    )
    val effectiveUserText = routed.cleanedUserText
    val contextMarkdown = buildContextMarkdown(ideContext)
    val userMessage = if (contextMarkdown.isBlank()) {
      effectiveUserText
    } else {
      "$effectiveUserText\n\nCurrent IDE context:\n\n$contextMarkdown"
    }
    history.add(ChatMessage("user", userMessage))
    val systemPrompt = buildSystemMessage(instructions, routed.selected)
    // Sanitize in case persisted history from a prior agent turn was trimmed and
    // split a tool-call/result pair, which the provider would reject.
    val messages = sanitizeToolMessages(listOf(ChatMessage("system", systemPrompt)) + history)

    // Surface exactly what we're about to send for the "Context sent to AI" panel.
    pushContextPreview(ideContext, routed.selected, systemPrompt, contextMarkdown)

    if (agentMode) {
      val agentMessages =
        sanitizeToolMessages(
          listOf(ChatMessage("system", "$systemPrompt\n\n$AGENT_MODE_SYSTEM_NOTE")) + history,
        )
      runAgentTurn(agentMessages)
      return
    }

    var started = false
    val response = try {
      client.streamChat(messages) { piece ->
        if (!started) {
          started = true
          push(message("assistantMessageStart"))
        }
        piece.reasoning?.let { push(message("assistantReasoningDelta") { put("text", it) }) }
        piece.content?.let { push(message("assistantMessageDelta") { put("text", it) }) }
      }
    } catch (error: Exception) {
      if (started) {
        history.removeLastOrNull()
        push(
          message("assistantMessageDelta") {
            put("text", "\n\nCodeSetu could not complete that request: ${error.message ?: error}")
          },
        )
        push(message("assistantMessageDone"))
        finish()
        return
      }

      try {
        client.chat(messages)
      } catch (fallbackError: Exception) {
        history.removeLastOrNull()
        push(
          message("error") {
            put("text", "CodeSetu could not complete that request: ${fallbackError.message ?: fallbackError}")
          },
        )
        finish()
        return
      }
    }

    if (response.isNotBlank()) {
      history.add(ChatMessage("assistant", response))
    } else {
      history.removeLastOrNull()
    }

    if (started) {
      if (response.isBlank()) {
        push(message("assistantMessageDelta") { put("text", "CodeSetu did not return any text.") })
      }
      push(message("assistantMessageDone"))
    } else {
      push(message("assistantMessage") { put("text", response.ifBlank { "CodeSetu did not return any text." }) })
    }
    finish()
  }

  /**
   * Agent-mode turn: drive the tool-calling loop and stream the model's
   * narration, tool activity, and final answer to the chat (reusing the same
   * assistantMessage* webview protocol as the streaming path). Runs on a pooled
   * thread; the approval dialog hops to the EDT via invokeAndWait.
   */
  private fun runAgentTurn(messages: List<ChatMessage>) {
    val host = IntellijAgentHost(project)
    var started = false
    fun ensureStarted() {
      if (!started) {
        started = true
        push(message("assistantMessageStart"))
      }
    }

    val result = try {
      runAgentLoop(
        client = client,
        initialMessages = messages,
        tools = defaultAgentTools(),
        host = host,
        maxTokens = 4096,
        temperature = 0.2,
        requestApproval = { request -> requestToolApproval(request) },
        onEvent = { event ->
          when (event) {
            is AgentEvent.AssistantText -> {
              ensureStarted()
              push(message("assistantMessageDelta") { put("text", "${event.text}\n") })
            }
            is AgentEvent.ToolCallStarted -> {
              ensureStarted()
              push(
                message("assistantMessageDelta") {
                  put("text", "\n\n`🔧 ${event.name}` ${summarizeArgs(event.name, event.args)}\n")
                },
              )
            }
            is AgentEvent.ToolResultReady -> {
              if (event.isError) {
                ensureStarted()
                val label = if (event.denied) "🚫 denied" else "⚠️ error"
                push(message("assistantMessageDelta") { put("text", "\n> $label: ${firstLine(event.content)}\n") })
              }
            }
            is AgentEvent.IterationLimit -> {
              ensureStarted()
              push(
                message("assistantMessageDelta") {
                  put("text", "\n\n_Stopped after ${event.limit} steps. Ask me to continue if needed._\n")
                },
              )
            }
          }
        },
      )
    } catch (error: Exception) {
      val detail = error.message ?: error.toString()
      if (started) {
        push(message("assistantMessageDelta") { put("text", "\n\nCodeSetu could not complete that request: $detail") })
        push(message("assistantMessageDone"))
      } else {
        push(message("error") { put("text", "CodeSetu could not complete that request: $detail") })
      }
      finish()
      return
    }

    // Persist the full tool transcript this turn produced (assistant tool-call
    // turns + tool results + final answer) so the next turn keeps that context.
    val newMessages = result.messages.drop(messages.size)
    if (newMessages.isNotEmpty()) {
      history.addAll(newMessages)
    } else if (result.text.isNotBlank()) {
      history.add(ChatMessage("assistant", result.text))
    }
    if (started) {
      push(message("assistantMessageDone"))
    } else {
      push(message("assistantMessage") { put("text", result.text.ifBlank { "CodeSetu did not return any text." }) })
    }
    finish()
  }

  /** Modal approval gate for a mutating tool call (must run on the EDT). */
  private fun requestToolApproval(request: ApprovalRequest): ApprovalDecision {
    var decision = ApprovalDecision.DENY
    ApplicationManager.getApplication().invokeAndWait {
      val options = arrayOf("Approve", "Approve for session", "Deny")
      val choice = Messages.showDialog(
        project,
        describeApproval(request),
        "CodeSetu wants to run \"${request.tool.name}\"",
        options,
        0,
        Messages.getWarningIcon(),
      )
      decision = when (options.getOrNull(choice)) {
        "Approve" -> ApprovalDecision.APPROVE
        "Approve for session" -> ApprovalDecision.APPROVE_ALWAYS
        else -> ApprovalDecision.DENY
      }
    }
    return decision
  }

  private fun describeApproval(request: ApprovalRequest): String = when (request.tool.name) {
    "bash" -> "Command:\n${request.args["command"]?.jsonPrimitive?.contentOrNull ?: request.rawArguments}"
    "write_file" -> "Write file: ${request.args["path"]?.jsonPrimitive?.contentOrNull ?: "?"}"
    "edit_file" -> "Edit file: ${request.args["path"]?.jsonPrimitive?.contentOrNull ?: "?"}"
    else -> request.rawArguments
  }

  private fun summarizeArgs(toolName: String, args: JsonObject): String =
    if (toolName == "bash") {
      "`${truncateInline(args["command"]?.jsonPrimitive?.contentOrNull ?: "")}`"
    } else {
      args["path"]?.jsonPrimitive?.contentOrNull?.let { "`$it`" } ?: ""
    }

  private fun truncateInline(text: String, limit: Int = 120): String {
    val oneLine = text.replace(Regex("\\s+"), " ").trim()
    return if (oneLine.length > limit) "${oneLine.substring(0, limit)}…" else oneLine
  }

  private fun firstLine(text: String): String = truncateInline(text.split("\n").firstOrNull() ?: "", 200)

  private fun showModelPicker() {
    ApplicationManager.getApplication().invokeLater {
      val state = CodeSetuSettingsState.getInstance().state
      val current = resolveCodeSetuModel(state.model)
      val configure = "⚙  Configure provider / endpoint…"
      val custom = "Enter a custom model id…"
      val items =
        (listOf(configure, custom, current) + CodeSetuModelCatalog.suggestionsFor(state.provider))
          .distinct()

      JBPopupFactory.getInstance()
        .createPopupChooserBuilder(items)
        .setTitle("CodeSetu model")
        .setItemChosenCallback { choice ->
          when (choice) {
            configure -> configureProvider()
            custom -> applyModel(Messages.showInputDialog(project, "Model id", "Select Model", null, current, null))
            else -> applyModel(choice)
          }
        }
        .createPopup()
        .showInFocusCenter()
    }
  }

  private fun applyModel(model: String?) {
    val trimmed = model?.trim().orEmpty()
    if (trimmed.isEmpty()) return
    CodeSetuSettingsState.getInstance().state.model = trimmed
    pushModelLabel()
  }

  // Lets the user switch provider (Sarvam / OpenAI-compatible (Ollama, local) /
  // Hugging Face) and set its base URL, model, and API key from the chat.
  private fun configureProvider() {
    val providers = listOf(
      "Sarvam" to "sarvam",
      "OpenAI-compatible (Ollama, vLLM, local)" to "openai-compatible",
      "Hugging Face" to "huggingface",
    )

    JBPopupFactory.getInstance()
      .createPopupChooserBuilder(providers.map { it.first })
      .setTitle("Configure provider")
      .setItemChosenCallback { label ->
        providers.firstOrNull { it.first == label }?.let { applyProvider(it.second) }
      }
      .createPopup()
      .showInFocusCenter()
  }

  private fun applyProvider(providerId: String) {
    val state = CodeSetuSettingsState.getInstance().state
    val defaults = providerDefaults(providerId)
    val baseUrlSeed =
      if (state.provider == providerId && state.baseUrl.isNotBlank()) state.baseUrl else defaults.baseUrl
    val modelSeed =
      if (state.provider == providerId && state.model.isNotBlank()) state.model else defaults.model

    val baseUrl =
      Messages.showInputDialog(project, "Base URL", "Configure Provider", null, baseUrlSeed, null)
        ?: return
    val model =
      Messages.showInputDialog(project, "Model id", "Configure Provider", null, modelSeed, null)
        ?: return
    val token =
      Messages.showPasswordDialog(
        project,
        "API key / token (leave blank to keep the current one)",
        "Configure Provider",
        null,
      )

    state.provider = providerId
    state.baseUrl = baseUrl.trim().ifBlank { defaults.baseUrl }
    state.model = model.trim().ifBlank { defaults.model }
    if (!token.isNullOrBlank()) {
      CodeSetuSettingsState.getInstance().setApiKey(token)
    }
    pushModelLabel()
    pushWelcome()
  }

  private fun pushModelLabel() {
    push(message("modelLabel") { put("text", modelLabelText()) })
  }

  private fun modelLabelText(): String {
    val state = CodeSetuSettingsState.getInstance().state
    return "${state.provider} · ${resolveCodeSetuModel(state.model)}"
  }

  private fun finish() {
    ApplicationManager.getApplication().invokeLater { inFlight = false }
    push(busy(false))
  }

  private fun push(json: String) {
    ApplicationManager.getApplication().invokeLater {
      if (ready) {
        executeJs(json)
      } else {
        pending.add(json)
      }
    }
  }

  private fun onReady() {
    ApplicationManager.getApplication().invokeLater {
      ready = true
      pending.forEach { executeJs(it) }
      pending.clear()
      pushWelcome()
    }
  }

  // The welcome panel shows on first use, when no provider key is configured.
  // Once the user has a key (or sends a message), it stays hidden for the
  // session.
  private fun pushWelcome() {
    push(message("welcome") { put("show", !isConfigured()) })
  }

  private fun isConfigured(): Boolean {
    if (CodeSetuSettingsState.getInstance().getApiKey().isNotBlank()) return true
    return sequenceOf("CODESETU_API_KEY", "SARVAM_API_KEY", "HF_TOKEN")
      .any { !System.getenv(it).isNullOrBlank() }
  }

  private fun executeJs(json: String) {
    browser.cefBrowser.executeJavaScript("window.__codesetuReceive($json)", browser.cefBrowser.url ?: "", 0)
  }

  private fun message(type: String, build: JsonObjectBuilder.() -> Unit = {}): String =
    buildJsonObject {
      put("type", type)
      build()
    }.toString()

  private fun busy(value: Boolean): String = message("busy") { put("value", value) }

  /** Emit the "Context sent to AI" preview: routed skills, the IDE-context
   *  summary, and the full assembled payload for deep inspection. */
  private fun pushContextPreview(
    ideContext: IdeContextPayload,
    selectedSkills: List<WorkspaceInstruction>,
    systemPrompt: String,
    contextMarkdown: String,
  ) {
    push(
      message("contextPreview") {
        putJsonObject("preview") {
          putJsonArray("skills") {
            selectedSkills.forEach { skill ->
              addJsonObject {
                put("name", skill.name)
                loadBuiltinSkills().firstOrNull { it.id == skill.id }
                  ?.slashCommands?.firstOrNull()
                  ?.let { put("slash", it) }
              }
            }
          }
          putJsonObject("ideContext") {
            ideContext.activeFilePath?.let { put("activeFilePath", it) }
            ideContext.languageId?.let { put("languageId", it) }
            put("hasSelection", !ideContext.selectedText.isNullOrEmpty())
            ideContext.selectedText?.let { put("selectedText", it) }
            put("snippetCount", ideContext.relatedSnippets.size)
          }
          putJsonObject("full") {
            put("systemPrompt", systemPrompt)
            put("contextMarkdown", contextMarkdown)
          }
        }
      },
    )
  }

  override fun dispose() {
    Disposer.dispose(jsQuery)
    Disposer.dispose(browser)
  }
}
