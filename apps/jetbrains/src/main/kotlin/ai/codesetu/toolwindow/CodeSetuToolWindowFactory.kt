package ai.codesetu.toolwindow

import ai.codesetu.actions.SetupSpeechProviderAction
import ai.codesetu.agent.AGENT_MODE_SYSTEM_NOTE
import ai.codesetu.agent.AgentEvent
import ai.codesetu.agent.ApprovalDecision
import ai.codesetu.agent.ApprovalRequest
import ai.codesetu.agent.IntellijAgentHost
import ai.codesetu.agent.AgentPolicy
import ai.codesetu.agent.DEFAULT_MAX_ITERATIONS
import ai.codesetu.agent.GetDiagnosticsTool
import ai.codesetu.agent.createBashCommandPolicy
import ai.codesetu.agent.defaultAgentTools
import ai.codesetu.agent.RevertResult
import ai.codesetu.agent.WorkspaceCheckpoint
import ai.codesetu.agent.checkpointingHost
import ai.codesetu.agent.parseAgentPolicy
import ai.codesetu.agent.runAgentLoop
import ai.codesetu.agent.sanitizeToolMessages
import ai.codesetu.context.collectIdeContext
import ai.codesetu.context.estimateTokensForParts
import ai.codesetu.context.readPinnedFiles
import ai.codesetu.context.searchWorkspaceFiles
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.ChatMessage
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.model.RetrievedSnippet
import ai.codesetu.model.WorkspaceInstruction
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.retrieval.WorkspaceIndexService
import ai.codesetu.retrieval.mentionsWorkspace
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
import java.io.File
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import com.intellij.ide.BrowserUtil
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import javax.swing.JComponent
import javax.swing.JLabel
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
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
  private val historyJson = Json { ignoreUnknownKeys = true }
  private val history = mutableListOf<ChatMessage>()
  // Snapshot of the persisted transcript, replayed once the webview mounts.
  private val restoredHistory: List<ChatMessage> = loadPersistedHistory()
  private var replayedHistory = false
  // File snapshots from the most recent agent turn, for "Revert Last Agent Edits".
  private var lastAgentCheckpoint: WorkspaceCheckpoint? = null

  // EDT-only state: outgoing messages buffered until the page signals "ready".
  private val pending = mutableListOf<String>()
  private var ready = false
  private var inFlight = false
  // Set when the user hits Stop; the agent loop checks it between steps.
  private val cancelRequested = AtomicBoolean(false)
  // In-flight inline tool approvals, keyed by request id, awaiting a webview click.
  private val pendingApprovals = ConcurrentHashMap<String, CompletableFuture<ApprovalDecision>>()

  val component: JComponent
    get() = browser.component

  init {
    jsQuery.addHandler { request ->
      handlePost(request)
      null
    }
    // Resume the conversation persisted for this project so a reload (or IDE
    // restart) doesn't lose the transcript. Replayed into the webview on ready.
    history.addAll(restoredHistory)
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
        val pinned = obj["pinnedFiles"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList()
        runChat(text, include, null, planMode, agentMode, pinned)
      }
      "searchFiles" -> {
        val requestId = obj["requestId"]?.jsonPrimitive?.contentOrNull ?: return
        val query = obj["query"]?.jsonPrimitive?.contentOrNull ?: ""
        ApplicationManager.getApplication().executeOnPooledThread {
          val files = searchWorkspaceFiles(project.basePath, query)
          push(
            message("fileResults") {
              put("requestId", requestId)
              putJsonArray("items") { files.forEach { add(it) } }
            },
          )
        }
      }
      "uiState" -> {
        val state = CodeSetuSettingsState.getInstance().state
        obj["planMode"]?.jsonPrimitive?.booleanOrNull?.let { state.chatPlanModeOn = it }
        obj["agentMode"]?.jsonPrimitive?.booleanOrNull?.let { state.chatAgentModeOn = it }
      }
      "insertCode" -> {
        val code = obj["code"]?.jsonPrimitive?.contentOrNull ?: return
        ApplicationManager.getApplication().invokeLater { insertCodeIntoEditor(code) }
      }
      "newChat" -> ApplicationManager.getApplication().invokeLater { clearConversation() }
      "cancel" -> {
        cancelRequested.set(true)
        resolvePendingApprovals(ApprovalDecision.DENY)
      }
      "toolApprovalResponse" -> {
        val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: return
        val decision =
          when (obj["decision"]?.jsonPrimitive?.contentOrNull) {
            "approve" -> ApprovalDecision.APPROVE
            "approve_always" -> ApprovalDecision.APPROVE_ALWAYS
            else -> ApprovalDecision.DENY
          }
        pendingApprovals.remove(id)?.complete(decision)
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
    pinnedFiles: List<String> = emptyList(),
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
        runRequest(trimmed, ideContext, planMode, agentMode, pinnedFiles)
      }
    }
  }

  private fun runRequest(
    userText: String,
    baseIdeContext: IdeContextPayload,
    planMode: Boolean,
    agentMode: Boolean = false,
    pinnedFiles: List<String> = emptyList(),
  ) {
    // @-pinned files are an explicit user choice — read them (off the EDT) and
    // attach as related snippets so they ride along as primary context.
    var ideContext =
      if (pinnedFiles.isEmpty()) {
        baseIdeContext
      } else {
        baseIdeContext.copy(
          relatedSnippets = baseIdeContext.relatedSnippets + readPinnedFiles(project.basePath, pinnedFiles),
        )
      }
    // @workspace opts the turn into semantic retrieval: pull the most relevant
    // indexed chunks and attach them as their own context section. The first use
    // auto-builds the index (this runs off the EDT) so the user doesn't have to
    // run "Index Workspace" manually — matching the VS Code behaviour.
    if (mentionsWorkspace(userText)) {
      val svc = WorkspaceIndexService.getInstance(project)
      val k = CodeSetuSettingsState.getInstance().state.workspaceRetrievalK
      try {
        // First use builds the index (off the EDT) so the user doesn't have to
        // run "Index Workspace" manually — matching VS Code.
        if (!svc.isIndexed()) svc.reindex()
        val retrieved = svc.retrieve(userText, k)
        if (retrieved.isNotEmpty()) {
          ideContext = ideContext.copy(
            retrievedSnippets = retrieved.map {
              RetrievedSnippet(path = it.path, startLine = it.startLine, endLine = it.endLine, text = it.text)
            },
          )
        }
      } catch (error: Exception) {
        // A down/misconfigured embeddings endpoint must not break the chat turn;
        // the model still answers without @workspace context.
        push(
          message("error") {
            put(
              "text",
              "CodeSetu @workspace failed: ${error.message ?: error}. " +
                "Check the embeddings endpoint (Settings ▸ Tools ▸ CodeSetu) and that the model is pulled.",
            )
          },
        )
      }
    }
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

    // Estimate how much context this turn carries (system prompt + rolling
    // history, which already folds in the IDE context) for the composer gauge.
    push(message("usage") { put("tokens", estimateTokensForParts(messages.map { it.content ?: "" })) })

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
  private fun loadAgentPolicy(): AgentPolicy {
    val basePath = project.basePath ?: return parseAgentPolicy("{}")
    val file = File("$basePath/.codesetu/agent.json")
    return if (file.isFile) {
      try {
        parseAgentPolicy(file.readText())
      } catch (error: Exception) {
        parseAgentPolicy("{}")
      }
    } else {
      parseAgentPolicy("{}")
    }
  }

  private fun runAgentTurn(messages: List<ChatMessage>) {
    // Snapshot every file the agent writes this turn so it can be reverted in
    // one click (structured edits only; bash side effects aren't tracked).
    val (host, checkpoint) = checkpointingHost(IntellijAgentHost(project))
    val policy = loadAgentPolicy()
    cancelRequested.set(false)
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
        tools = defaultAgentTools() + GetDiagnosticsTool(project) +
          listOfNotNull(WorkspaceIndexService.getInstance(project).searchToolOrNull()),
        host = host,
        maxTokens = 4096,
        temperature = 0.2,
        maxIterations = policy.maxIterations ?: DEFAULT_MAX_ITERATIONS,
        isCancelled = { cancelRequested.get() },
        requestApproval = { request -> requestToolApproval(request) },
        resolvePolicy = createBashCommandPolicy(policy),
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

    // Keep this turn's snapshots around so the user can revert the agent's file
    // edits in one click (replaces any prior turn's checkpoint).
    lastAgentCheckpoint = checkpoint.takeIf { !it.isEmpty() }

    if (result.stoppedReason == "aborted") {
      ensureStarted()
      push(message("assistantMessageDelta") { put("text", "\n\n_Stopped by you._\n") })
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

  /**
   * Inline approval gate: render a card in the chat and block the (background)
   * agent thread until the user clicks a button in the webview. Replaces the
   * native modal dialog. Runs off the EDT — `future.get()` parks the loop.
   */
  private fun requestToolApproval(request: ApprovalRequest): ApprovalDecision {
    val id = UUID.randomUUID().toString()
    val future = CompletableFuture<ApprovalDecision>()
    pendingApprovals[id] = future
    push(
      message("toolApproval") {
        put("id", id)
        put("tool", request.tool.name)
        put("detail", describeApproval(request))
      },
    )
    return try {
      future.get()
    } catch (error: Exception) {
      ApprovalDecision.DENY
    } finally {
      pendingApprovals.remove(id)
    }
  }

  /** Settle any awaiting approvals (e.g. on Stop or panel close) so the loop unblocks. */
  private fun resolvePendingApprovals(decision: ApprovalDecision) {
    pendingApprovals.values.forEach { it.complete(decision) }
    pendingApprovals.clear()
  }

  private fun describeApproval(request: ApprovalRequest): String =
    request.preview ?: when (request.tool.name) {
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

  /**
   * Insert a code snippet from a chat code block into the active editor —
   * replacing the selection if there is one, otherwise inserting at the caret.
   */
  private fun insertCodeIntoEditor(code: String) {
    val editor = FileEditorManager.getInstance(project).selectedTextEditor
    if (editor == null) {
      Messages.showInfoMessage(
        project,
        "Open a file and place the caret where you want the code inserted.",
        "CodeSetu",
      )
      return
    }
    WriteCommandAction.runWriteCommandAction(project) {
      val document = editor.document
      val selection = editor.selectionModel
      if (selection.hasSelection()) {
        val start = selection.selectionStart
        document.replaceString(start, selection.selectionEnd, code)
        editor.caretModel.moveToOffset(start + code.length)
      } else {
        val offset = editor.caretModel.offset
        document.insertString(offset, code)
        editor.caretModel.moveToOffset(offset + code.length)
      }
    }
  }

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
    persistHistory()
    push(busy(false))
  }

  private fun historyStorageKey(): String = "codesetu.chat.history"

  private fun loadPersistedHistory(): List<ChatMessage> {
    val raw = PropertiesComponent.getInstance(project).getValue(historyStorageKey()) ?: return emptyList()
    return try {
      historyJson.decodeFromString<List<ChatMessage>>(raw)
    } catch (error: Exception) {
      emptyList()
    }
  }

  /** Persist the current transcript for this project so it survives a reload. */
  private fun persistHistory() {
    PropertiesComponent.getInstance(project)
      .setValue(historyStorageKey(), historyJson.encodeToString(history.toList()))
  }

  /** Replay the persisted conversation into a freshly mounted webview (once). */
  private fun replayRestoredHistory() {
    if (replayedHistory) return
    replayedHistory = true
    for (entry in restoredHistory) {
      if (entry.content.isEmpty()) continue // skip tool-call / tool-result turns
      when (entry.role) {
        "user" -> push(message("userMessage") { put("text", entry.content) })
        "assistant" -> push(message("assistantMessage") { put("text", entry.content) })
      }
    }
  }

  /**
   * Revert the file edits made by the most recent agent turn, restoring each
   * touched file to its pre-turn state (and deleting files the agent created).
   */
  fun revertLastAgentEdits() {
    ApplicationManager.getApplication().invokeLater {
      val checkpoint = lastAgentCheckpoint
      if (checkpoint == null || checkpoint.isEmpty()) {
        Messages.showInfoMessage(project, "No CodeSetu agent edits to revert.", "CodeSetu")
        return@invokeLater
      }
      val files = checkpoint.changedFiles()
      val confirm = Messages.showYesNoDialog(
        project,
        "Revert the last CodeSetu agent turn? This restores ${files.size} " +
          "file${if (files.size == 1) "" else "s"} to their pre-turn state.",
        "Revert Agent Edits",
        Messages.getWarningIcon(),
      )
      if (confirm != Messages.YES) return@invokeLater

      val result = ApplicationManager.getApplication().runWriteAction<RevertResult> {
        checkpoint.revert()
      }
      lastAgentCheckpoint = null
      // Re-sync the VFS / open editors with the restored on-disk state.
      project.basePath?.let {
        LocalFileSystem.getInstance().refreshAndFindFileByPath(it)?.refresh(false, true)
      }
      val extra = buildString {
        if (result.deleted > 0) append(", deleted ${result.deleted}")
        if (result.failed > 0) append(", ${result.failed} failed")
      }
      Messages.showInfoMessage(
        project,
        "Reverted ${result.restored} file${if (result.restored == 1) "" else "s"}$extra.",
        "CodeSetu",
      )
    }
  }

  /** Clear the conversation in both the host and the webview ("New chat"). */
  private fun clearConversation() {
    if (inFlight) {
      cancelRequested.set(true)
      resolvePendingApprovals(ApprovalDecision.DENY)
    }
    history.clear()
    persistHistory()
    push(message("clearTranscript"))
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
      replayRestoredHistory()
      // A restored transcript means the user is mid-conversation — skip the
      // first-run welcome panel in that case.
      if (history.isEmpty()) pushWelcome()
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
    resolvePendingApprovals(ApprovalDecision.DENY)
    Disposer.dispose(jsQuery)
    Disposer.dispose(browser)
  }
}
