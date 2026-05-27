plugins {
  // Kotlin version must be >= the version bundled in the target IntelliJ Platform.
  // IDEA 2025.2 (IC-252.x) ships with Kotlin 2.2.x.
  id("org.jetbrains.kotlin.jvm") version "2.2.0"
  id("org.jetbrains.kotlin.plugin.serialization") version "2.2.0"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "ai.codesetu.apiclient"
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
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
  implementation("org.yaml:snakeyaml:2.2")
  testImplementation(kotlin("test"))

  intellijPlatform {
    // Use a local IDE only when explicitly requested. The pinned platform keeps
    // tests and CI hermetic across machines.
    val localIdePath = project.findProperty("codesetu.intellij.path") as String?
    if (localIdePath != null && file(localIdePath).exists()) {
      local(localIdePath)
    } else {
      // Pinned platform version for hermetic CI builds. Bump in lockstep with
      // sinceBuild below when targeting a newer IDE.
      intellijIdeaCommunity("2025.2.5")
    }
    instrumentationTools()
  }
}

tasks.test {
  useJUnitPlatform()
  jvmArgumentProviders.removeIf {
    it.javaClass.name.contains("IntelliJPlatformArgumentProvider")
  }
  systemProperties.remove("java.system.class.loader")
}

kotlin {
  // IntelliJ Platform 2025.2 requires JDK 21. The foojay resolver (configured
  // in settings.gradle.kts) will auto-download JDK 21 if it's not installed.
  jvmToolchain(21)
}

intellijPlatform {
  pluginConfiguration {
    ideaVersion {
      sinceBuild = "252"
      untilBuild = provider { null }
    }
  }
  buildSearchableOptions = false
  publishing {
    token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
  }
}
