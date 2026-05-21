plugins {
  // Kotlin version must be >= the version bundled in the target IntelliJ Platform.
  // IDEA 2025.2 (IC-252.x) ships with Kotlin 2.2.x.
  id("org.jetbrains.kotlin.jvm") version "2.2.0"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "ai.codesetu"
// Plugin version. Read from -PpluginVersion or gradle.properties so CI can
// override it with <major>.<minor>.<run_number> at release time.
version = (project.findProperty("pluginVersion") as String?) ?: "0.0.0"

repositories {
  mavenCentral()
  intellijPlatform {
    defaultRepositories()
    intellijDependencies()
  }
}

dependencies {
  intellijPlatform {
    // Prefer a locally installed IDE for faster dev iteration. On CI (or any
    // machine without IDEA installed at that path), download the platform.
    val localIdePath = (project.findProperty("codesetu.intellij.path") as String?)
      ?: "/Applications/IntelliJ IDEA CE.app"
    if (file(localIdePath).exists()) {
      local(localIdePath)
    } else {
      // Pinned platform version for hermetic CI builds. Bump in lockstep with
      // sinceBuild below when targeting a newer IDE.
      intellijIdeaCommunity("2025.2.5")
    }
    instrumentationTools()
  }
}

kotlin {
  // IntelliJ Platform 2025.2 requires JDK 21. The foojay resolver (configured
  // in settings.gradle.kts) will auto-download JDK 21 if it's not installed.
  jvmToolchain(21)
}

intellijPlatform {
  pluginConfiguration {
    ideaVersion {
      // Match the locally installed IDEA build (IC-252.x = 2025.2). Adjust if
      // you want the plugin to work on older IDEs.
      sinceBuild = "252"
      untilBuild = provider { null }
    }
  }
  // Skip the searchable-options index task. It launches a headless IDE to
  // compute a settings-search index; our scaffold has no settings panel, so
  // it's pure overhead. Re-enable once we add settings UI.
  buildSearchableOptions = false
  publishing {
    token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
  }
}
