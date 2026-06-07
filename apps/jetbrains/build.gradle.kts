import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType

plugins {
  // Kotlin version must be >= the version bundled in the target IntelliJ Platform.
  // IDEA 2025.2 (IC-252.x) ships with Kotlin 2.2.x.
  id("org.jetbrains.kotlin.jvm") version "2.2.0"
  id("org.jetbrains.kotlin.plugin.serialization") version "2.2.0"
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
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
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
    // CLI used by the `verifyPlugin` task (JetBrains Plugin Verifier).
    pluginVerifier()
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

// Bundle the canonical built-in skills (single source of truth lives at the repo
// root /skills) into plugin resources so the runtime loader can read them from
// the classpath. The Gradle root here is apps/jetbrains, so the repo-root skills
// dir is two levels up. Only <id>/SKILL.md files are copied (README.md skipped).
val copyBuiltinSkills by tasks.registering(Copy::class) {
  from(rootProject.projectDir.resolve("../../skills")) {
    include("*/SKILL.md")
  }
  into(layout.buildDirectory.dir("generated-resources/skills"))
}

sourceSets["main"].resources.srcDir(layout.buildDirectory.dir("generated-resources"))

tasks.named("processResources") {
  dependsOn(copyBuiltinSkills)
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
  // `verifyPlugin` runs the JetBrains Plugin Verifier. Pin it to the build
  // target so it's deterministic and always resolvable (recommended() can pick
  // an unreleased IDE that fails to download).
  pluginVerification {
    ides {
      ide(IntelliJPlatformType.IntellijIdeaCommunity, "2025.2.5")
    }
  }
  publishing {
    token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
  }
}
