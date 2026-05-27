package ai.codesetu.apiclient.ui

import ai.codesetu.apiclient.model.ApiKeyAuth
import ai.codesetu.apiclient.model.ApiKeyLocation
import ai.codesetu.apiclient.model.Auth
import ai.codesetu.apiclient.model.AuthType
import ai.codesetu.apiclient.model.BasicAuth
import ai.codesetu.apiclient.model.BearerAuth
import ai.codesetu.apiclient.model.BodyMode
import ai.codesetu.apiclient.model.HttpRequest
import ai.codesetu.apiclient.model.RawLanguage
import ai.codesetu.apiclient.model.RequestBody
import ai.codesetu.apiclient.model.RequestNode
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTabbedPane
import javax.swing.JTable
import javax.swing.JTextArea
import javax.swing.JTextField

/** REST request editor: method/URL bar plus Params/Headers/Body/Auth tabs. */
class RequestEditorPanel : JPanel(BorderLayout()) {
  private val methods = arrayOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
  private val methodCombo = JComboBox(methods)
  private val urlField = JTextField()
  private val sendButton = JButton("Send")

  private var queryModel = KeyValueTableModel(emptyList())
  private var headerModel = KeyValueTableModel(emptyList())
  private val queryTable = JTable(queryModel)
  private val headerTable = JTable(headerModel)

  private val bodyModeCombo = JComboBox(BodyMode.entries.toTypedArray())
  private val rawLangCombo = JComboBox(RawLanguage.entries.toTypedArray())
  private val rawArea = JTextArea()
  private var urlencodedModel = KeyValueTableModel(emptyList())
  private val urlencodedTable = JTable(urlencodedModel)
  private val bodyCards = JPanel(CardLayout())

  private val authTypeCombo = JComboBox(AuthType.entries.toTypedArray())
  private val bearerToken = JTextField()
  private val basicUser = JTextField()
  private val basicPass = JTextField()
  private val apikeyKey = JTextField()
  private val apikeyValue = JTextField()
  private val apikeyLocation = JComboBox(ApiKeyLocation.entries.toTypedArray())
  private val authCards = JPanel(CardLayout())

  private var loaded: RequestNode? = null
  private var loadedHttp: HttpRequest = HttpRequest()

  var onSend: () -> Unit = {}

  init {
    add(buildUrlBar(), BorderLayout.NORTH)
    add(buildTabs(), BorderLayout.CENTER)
    sendButton.addActionListener { onSend() }
    bodyModeCombo.addActionListener { showBodyCard() }
    authTypeCombo.addActionListener { showAuthCard() }
    isEnabledRecursively(false)
  }

  private fun buildUrlBar(): JPanel {
    val panel = JPanel(BorderLayout(6, 6))
    methodCombo.maximumSize = Dimension(110, 28)
    val left = JPanel(BorderLayout(6, 0))
    left.add(methodCombo, BorderLayout.WEST)
    left.add(urlField, BorderLayout.CENTER)
    panel.add(left, BorderLayout.CENTER)
    panel.add(sendButton, BorderLayout.EAST)
    panel.border = javax.swing.BorderFactory.createEmptyBorder(6, 6, 6, 6)
    return panel
  }

  private fun buildTabs(): JTabbedPane {
    val tabs = JTabbedPane()
    tabs.addTab("Params", JScrollPane(queryTable))
    tabs.addTab("Headers", JScrollPane(headerTable))
    tabs.addTab("Body", buildBodyPanel())
    tabs.addTab("Auth", buildAuthPanel())
    return tabs
  }

  private fun buildBodyPanel(): JPanel {
    val panel = JPanel(BorderLayout(6, 6))
    val top = JPanel(FlowLayout(FlowLayout.LEFT))
    top.add(JLabel("Type:"))
    top.add(bodyModeCombo)
    top.add(rawLangCombo)
    panel.add(top, BorderLayout.NORTH)

    bodyCards.add(JPanel(), BodyMode.NONE.name)
    rawArea.lineWrap = true
    bodyCards.add(JScrollPane(rawArea), BodyMode.RAW.name)
    bodyCards.add(JScrollPane(urlencodedTable), BodyMode.URLENCODED.name)
    val placeholder = JPanel(BorderLayout())
    placeholder.add(JLabel("This body type is not yet editable in the JetBrains client."), BorderLayout.NORTH)
    bodyCards.add(placeholder, "OTHER")
    panel.add(bodyCards, BorderLayout.CENTER)
    return panel
  }

  private fun buildAuthPanel(): JPanel {
    val panel = JPanel(BorderLayout(6, 6))
    val top = JPanel(FlowLayout(FlowLayout.LEFT))
    top.add(JLabel("Type:"))
    top.add(authTypeCombo)
    panel.add(top, BorderLayout.NORTH)

    authCards.add(JPanel(), AuthType.NONE.name)
    authCards.add(JPanel(), AuthType.INHERIT.name)
    authCards.add(labeledForm("Token", bearerToken), AuthType.BEARER.name)
    authCards.add(labeledForm("Username", basicUser, "Password", basicPass), AuthType.BASIC.name)
    authCards.add(
      labeledForm("Key", apikeyKey, "Value", apikeyValue).also { it.add(rowOf("Add to", apikeyLocation)) },
      AuthType.APIKEY.name,
    )
    authCards.add(labeledForm("Access Token", bearerTokenForOauth()), AuthType.OAUTH2.name)
    panel.add(authCards, BorderLayout.CENTER)
    return panel
  }

  // OAuth2 reuses a dedicated field so it doesn't collide with the bearer token field.
  private val oauthToken = JTextField()
  private fun bearerTokenForOauth(): JTextField = oauthToken

  fun load(node: RequestNode) {
    loaded = node
    val http = node.http ?: HttpRequest()
    loadedHttp = http
    isEnabledRecursively(true)

    methodCombo.selectedItem = http.method
    urlField.text = http.url
    queryModel = KeyValueTableModel(http.queryParams).also { queryTable.model = it }
    headerModel = KeyValueTableModel(http.headers).also { headerTable.model = it }

    bodyModeCombo.selectedItem = http.body.mode
    rawArea.text = http.body.raw ?: ""
    rawLangCombo.selectedItem = http.body.rawLanguage ?: RawLanguage.JSON
    urlencodedModel = KeyValueTableModel(http.body.urlencoded).also { urlencodedTable.model = it }
    showBodyCard()

    authTypeCombo.selectedItem = http.auth.type
    bearerToken.text = http.auth.bearer?.token ?: ""
    basicUser.text = http.auth.basic?.username ?: ""
    basicPass.text = http.auth.basic?.password ?: ""
    apikeyKey.text = http.auth.apikey?.key ?: ""
    apikeyValue.text = http.auth.apikey?.value ?: ""
    apikeyLocation.selectedItem = http.auth.apikey?.location ?: ApiKeyLocation.HEADER
    oauthToken.text = http.auth.oauth2?.accessToken ?: ""
    showAuthCard()
  }

  fun clear() {
    loaded = null
    isEnabledRecursively(false)
  }

  /** Reads the current UI into the loaded request node, or null if nothing is loaded. */
  fun collect(): RequestNode? {
    val node = loaded ?: return null
    val http = loadedHttp.copy(
      method = methodCombo.selectedItem as? String ?: "GET",
      url = urlField.text,
      queryParams = queryModel.snapshot(),
      headers = headerModel.snapshot(),
      body = collectBody(),
      auth = collectAuth(),
    )
    val updated = node.copy(http = http)
    loaded = updated
    loadedHttp = http
    return updated
  }

  private fun collectBody(): RequestBody {
    return when (bodyModeCombo.selectedItem as? BodyMode ?: BodyMode.NONE) {
      BodyMode.NONE -> RequestBody(mode = BodyMode.NONE)
      BodyMode.RAW -> RequestBody(
        mode = BodyMode.RAW,
        raw = rawArea.text,
        rawLanguage = rawLangCombo.selectedItem as? RawLanguage ?: RawLanguage.JSON,
      )
      BodyMode.URLENCODED -> RequestBody(mode = BodyMode.URLENCODED, urlencoded = urlencodedModel.snapshot())
      else -> loadedHttp.body
    }
  }

  private fun collectAuth(): Auth {
    return when (authTypeCombo.selectedItem as? AuthType ?: AuthType.NONE) {
      AuthType.NONE -> Auth(type = AuthType.NONE)
      AuthType.INHERIT -> Auth(type = AuthType.INHERIT)
      AuthType.BEARER -> Auth(type = AuthType.BEARER, bearer = BearerAuth(bearerToken.text))
      AuthType.BASIC -> Auth(type = AuthType.BASIC, basic = BasicAuth(basicUser.text, basicPass.text))
      AuthType.APIKEY -> Auth(
        type = AuthType.APIKEY,
        apikey = ApiKeyAuth(
          apikeyKey.text,
          apikeyValue.text,
          apikeyLocation.selectedItem as? ApiKeyLocation ?: ApiKeyLocation.HEADER,
        ),
      )
      AuthType.OAUTH2 -> Auth(
        type = AuthType.OAUTH2,
        oauth2 = ai.codesetu.apiclient.model.OAuth2Auth(accessToken = oauthToken.text),
      )
    }
  }

  private fun showBodyCard() {
    val mode = bodyModeCombo.selectedItem as? BodyMode ?: BodyMode.NONE
    val card = when (mode) {
      BodyMode.NONE, BodyMode.RAW, BodyMode.URLENCODED -> mode.name
      else -> "OTHER"
    }
    rawLangCombo.isVisible = mode == BodyMode.RAW
    (bodyCards.layout as CardLayout).show(bodyCards, card)
  }

  private fun showAuthCard() {
    val type = authTypeCombo.selectedItem as? AuthType ?: AuthType.NONE
    (authCards.layout as CardLayout).show(authCards, type.name)
  }

  private fun labeledForm(vararg labelsAndFields: Any): JPanel {
    val panel = JPanel()
    panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
    var index = 0
    while (index + 1 < labelsAndFields.size) {
      val label = labelsAndFields[index] as String
      val field = labelsAndFields[index + 1] as JTextField
      panel.add(rowOf(label, field))
      index += 2
    }
    return panel
  }

  private fun rowOf(label: String, component: javax.swing.JComponent): JPanel {
    val row = JPanel(BorderLayout(6, 0))
    val tag = JLabel(label)
    tag.preferredSize = Dimension(90, 24)
    row.add(tag, BorderLayout.WEST)
    row.add(component, BorderLayout.CENTER)
    row.maximumSize = Dimension(Int.MAX_VALUE, 30)
    return row
  }

  private fun isEnabledRecursively(enabled: Boolean) {
    methodCombo.isEnabled = enabled
    urlField.isEnabled = enabled
    sendButton.isEnabled = enabled
  }
}
