package ai.codesetu.apiclient.ui

import ai.codesetu.apiclient.engine.HttpEngine
import ai.codesetu.apiclient.importer.CollectionImporter
import ai.codesetu.apiclient.importer.ImportFormat
import ai.codesetu.apiclient.model.ModelFactory
import ai.codesetu.apiclient.model.RequestNode
import ai.codesetu.apiclient.model.VariableScope
import ai.codesetu.apiclient.store.ApiClientState
import ai.codesetu.apiclient.store.ApiClientStore
import ai.codesetu.apiclient.store.HistoryEntry
import ai.codesetu.apiclient.store.StateOps
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JFileChooser
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JSplitPane
import javax.swing.JTree
import javax.swing.SwingUtilities
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath
import javax.swing.tree.TreeSelectionModel

/** Main API Client tool window content: collections tree, request editor, and response viewer. */
class ApiClientPanel : JPanel(BorderLayout()) {
  private val store = ApiClientStore.getInstance()
  private val engine = HttpEngine()
  private var state: ApiClientState = store.load()

  private val rootNode = DefaultMutableTreeNode("root")
  private val treeModel = DefaultTreeModel(rootNode)
  private val tree = JTree(treeModel)
  private val editor = RequestEditorPanel()
  private val response = ResponsePanel()
  private val envCombo = JComboBox<String>()

  private var suppressSelection = false

  init {
    tree.isRootVisible = false
    tree.showsRootHandles = true
    tree.selectionModel.selectionMode = TreeSelectionModel.SINGLE_TREE_SELECTION
    tree.cellRenderer = javax.swing.tree.DefaultTreeCellRenderer()

    editor.onSend = { sendCurrent() }
    tree.addTreeSelectionListener { if (!suppressSelection) onTreeSelection() }

    val left = JPanel(BorderLayout())
    left.add(buildToolbar(), BorderLayout.NORTH)
    left.add(JScrollPane(tree), BorderLayout.CENTER)

    val right = JSplitPane(JSplitPane.VERTICAL_SPLIT, editor, response)
    right.resizeWeight = 0.5

    val split = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, left, right)
    split.resizeWeight = 0.28
    add(split, BorderLayout.CENTER)

    rebuildEnvCombo()
    rebuildTree(null)
  }

  private fun buildToolbar(): JComponent {
    val panel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 4))
    panel.add(button("+Collection") { newCollection() })
    panel.add(button("+Request") { newRequest() })
    panel.add(button("+Folder") { newFolder() })
    panel.add(button("Import") { importFile() })
    panel.add(button("Delete") { deleteSelected() })
    panel.add(envCombo)
    envCombo.addActionListener { onEnvChanged() }
    return panel
  }

  private fun button(text: String, action: () -> Unit): JButton =
    JButton(text).apply { addActionListener { action() } }

  // --- Tree -----------------------------------------------------------------

  private fun rebuildTree(selectId: String?) {
    saveEditor()
    suppressSelection = true
    rootNode.removeAllChildren()
    for (collection in state.collections) {
      val node = DefaultMutableTreeNode(TreeRef("collection", collection.id, null, collection.name))
      addChildren(node, collection.children, collection.id)
      rootNode.add(node)
    }
    treeModel.reload()
    for (i in 0 until tree.rowCount) {
      tree.expandRow(i)
    }
    suppressSelection = false
    if (selectId != null) {
      selectById(selectId)
    }
  }

  private fun addChildren(
    parent: DefaultMutableTreeNode,
    nodes: List<ai.codesetu.apiclient.model.CollectionNode>,
    collectionId: String,
  ) {
    for (node in nodes) {
      when (node) {
        is ai.codesetu.apiclient.model.FolderNode -> {
          val folder = DefaultMutableTreeNode(TreeRef("folder", node.id, collectionId, node.name))
          addChildren(folder, node.children, collectionId)
          parent.add(folder)
        }
        is RequestNode -> {
          val label = "${node.http?.method ?: "GET"}  ${node.name}"
          parent.add(DefaultMutableTreeNode(TreeRef("request", node.id, collectionId, label)))
        }
      }
    }
  }

  private fun selectById(id: String) {
    val node = findTreeNode(rootNode, id) ?: return
    val path = TreePath(node.path)
    tree.selectionPath = path
    tree.scrollPathToVisible(path)
  }

  private fun findTreeNode(parent: DefaultMutableTreeNode, id: String): DefaultMutableTreeNode? {
    for (i in 0 until parent.childCount) {
      val child = parent.getChildAt(i) as DefaultMutableTreeNode
      if ((child.userObject as? TreeRef)?.id == id) return child
      findTreeNode(child, id)?.let { return it }
    }
    return null
  }

  private fun selectedRef(): TreeRef? {
    val node = tree.lastSelectedPathComponent as? DefaultMutableTreeNode ?: return null
    return node.userObject as? TreeRef
  }

  private fun onTreeSelection() {
    saveEditor()
    val ref = selectedRef()
    if (ref?.kind == "request") {
      StateOps.findRequest(state.collections, ref.id)?.let { editor.load(it) }
    } else {
      editor.clear()
    }
  }

  // --- Mutations -------------------------------------------------------------

  private fun newCollection() {
    val collection = ModelFactory.collection("New Collection")
    state = state.copy(collections = state.collections + collection)
    persist()
    rebuildTree(collection.id)
  }

  private fun newRequest() {
    val node = ModelFactory.requestNode("New Request")
    val ref = selectedRef()
    val target = resolveAddTarget(ref)
    if (target == null) {
      newCollection()
      val created = state.collections.last()
      state = state.copy(collections = StateOps.addNode(state.collections, created.id, null, node))
    } else {
      state = state.copy(collections = StateOps.addNode(state.collections, target.first, target.second, node))
    }
    persist()
    rebuildTree(node.id)
  }

  private fun newFolder() {
    val ref = selectedRef() ?: return
    val target = resolveAddTarget(ref) ?: return
    val folder = ModelFactory.folderNode("New Folder")
    state = state.copy(collections = StateOps.addNode(state.collections, target.first, target.second, folder))
    persist()
    rebuildTree(folder.id)
  }

  /** Returns (collectionId, folderId?) to add into, based on the current selection. */
  private fun resolveAddTarget(ref: TreeRef?): Pair<String, String?>? {
    if (ref == null) return null
    return when (ref.kind) {
      "collection" -> ref.id to null
      "folder" -> ref.collectionId?.let { it to ref.id }
      "request" -> ref.collectionId?.let { it to null }
      else -> null
    }
  }

  private fun deleteSelected() {
    val ref = selectedRef() ?: return
    state = if (ref.kind == "collection") {
      state.copy(collections = state.collections.filter { it.id != ref.id })
    } else {
      state.copy(collections = StateOps.removeNode(state.collections, ref.id))
    }
    editor.clear()
    persist()
    rebuildTree(null)
  }

  private fun importFile() {
    val chooser = JFileChooser()
    if (chooser.showOpenDialog(this) != JFileChooser.APPROVE_OPTION) return
    try {
      val result = CollectionImporter.importCollections(chooser.selectedFile.readText(), ImportFormat.AUTO)
      state = state.copy(collections = state.collections + result.collections)
      persist()
      rebuildTree(null)
      Messages.showInfoMessage(
        "Imported ${result.collections.size} collection(s) (${result.format.name.lowercase()}).",
        "CodeSetu API Client",
      )
    } catch (error: Exception) {
      Messages.showErrorDialog(error.message ?: error.toString(), "Import Failed")
    }
  }

  // --- Environments ----------------------------------------------------------

  private fun rebuildEnvCombo() {
    suppressSelection = true
    envCombo.removeAllItems()
    envCombo.addItem("No Environment")
    state.environments.forEach { envCombo.addItem(it.name) }
    val activeIndex = state.environments.indexOfFirst { it.id == state.activeEnvironmentId }
    envCombo.selectedIndex = if (activeIndex >= 0) activeIndex + 1 else 0
    suppressSelection = false
  }

  private fun onEnvChanged() {
    if (suppressSelection) return
    val index = envCombo.selectedIndex
    val id = if (index <= 0) null else state.environments.getOrNull(index - 1)?.id
    state = state.copy(activeEnvironmentId = id)
    persist()
  }

  // --- Send ------------------------------------------------------------------

  private fun sendCurrent() {
    val node = editor.collect() ?: return
    state = state.copy(collections = StateOps.replaceRequest(state.collections, node))
    persist()

    val http = node.http ?: return
    val context = StateOps.requestContext(state.collections, node.id)
    val environment = state.environments.firstOrNull { it.id == state.activeEnvironmentId }
    val scope = VariableScope(
      globals = state.globals,
      collection = context.collectionVariables,
      environment = environment?.variables ?: emptyList(),
    )

    response.showLoading()
    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        val result = engine.execute(http, scope, context.inheritedAuth)
        SwingUtilities.invokeLater {
          response.show(result)
          recordHistory(node, result.status, result.ok, result.timings.durationMs)
        }
      } catch (error: Exception) {
        SwingUtilities.invokeLater { response.showError(error.message ?: error.toString()) }
      }
    }
  }

  private fun recordHistory(node: RequestNode, status: Int, ok: Boolean, durationMs: Long) {
    val entry = HistoryEntry(
      id = "${node.id}-${System.currentTimeMillis()}",
      at = System.currentTimeMillis(),
      method = node.http?.method ?: "GET",
      url = node.http?.url ?: "",
      status = status,
      ok = ok,
      durationMs = durationMs,
    )
    state = state.copy(history = (listOf(entry) + state.history).take(100))
    persist()
  }

  private fun saveEditor() {
    val node = editor.collect() ?: return
    state = state.copy(collections = StateOps.replaceRequest(state.collections, node))
    persist()
  }

  private fun persist() {
    store.save(state)
  }

  private class TreeRef(
    val kind: String,
    val id: String,
    val collectionId: String?,
    val label: String,
  ) {
    override fun toString(): String = label
  }
}
