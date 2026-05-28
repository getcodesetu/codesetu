package ai.codesetu.toolwindow

import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.ChatMessage
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.model.WorkspaceInstruction
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.prompts.PLAN_MODE_SKILL
import ai.codesetu.prompts.buildContextMarkdown
import ai.codesetu.prompts.buildSystemMessage
import ai.codesetu.settings.CodeSetuModelCatalog
import ai.codesetu.settings.CodeSetuSettingsState
import ai.codesetu.settings.providerDefaults
import ai.codesetu.settings.resolveCodeSetuModel
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
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
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

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
    runChat(text, includeContext = true, captured = capturedIdeContext)
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
        val planMode = obj["planMode"]?.jsonPrimitive?.booleanOrNull ?: false
        runChat(text, include, null, planMode)
      }
    }
  }

  private fun runChat(
    text: String,
    includeContext: Boolean,
    captured: IdeContextPayload?,
    planMode: Boolean = false,
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
        runRequest(trimmed, ideContext, planMode)
      }
    }
  }

  private fun runRequest(userText: String, ideContext: IdeContextPayload, planMode: Boolean) {
    val instructions = ReadAction.compute<List<WorkspaceInstruction>, RuntimeException> {
      loadWorkspaceInstructions(project)
    }
    val pinnedSkills = if (planMode) listOf(PLAN_MODE_SKILL) else emptyList()
    val contextMarkdown = buildContextMarkdown(ideContext)
    val userMessage = if (contextMarkdown.isBlank()) {
      userText
    } else {
      "$userText\n\nCurrent IDE context:\n\n$contextMarkdown"
    }
    history.add(ChatMessage("user", userMessage))
    val messages =
      listOf(ChatMessage("system", buildSystemMessage(instructions, pinnedSkills))) + history

    var started = false
    val response = try {
      client.streamChat(messages) { chunk ->
        if (!started) {
          started = true
          push(message("assistantMessageStart"))
        }
        push(message("assistantMessageDelta") { put("text", chunk) })
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

  override fun dispose() {
    Disposer.dispose(jsQuery)
    Disposer.dispose(browser)
  }
}
