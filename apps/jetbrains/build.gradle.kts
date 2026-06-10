import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType

plugins {
  // Kotlin version must be >= the version bundled in the target IntelliJ Platform.
  // IDEA 2025.2 (IC-252.x) ships with Kotlin 2.2.x.
  id("org.jetbrains.kotlin.jvm") version "2.2.0"
  id("org.jetbrains.kotlin.plugin.serialization") version "2.2.0"
  id("org.jetbrains.intellij.platform") version "2.5.0"
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
  // Pin kotlin-test to its JUnit 5 flavor and provide the engine + launcher
  // ourselves. The tasks.test block below strips the IntelliJ Platform test
  // bootstrap (these are plain unit tests that don't boot an IDE), and as of the
  // 2.5.x platform plugin that bootstrap was the only thing putting a JUnit
  // runtime on the test classpath.
  testImplementation(platform("org.junit:junit-bom:5.11.4"))
  testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
  testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
  // The IntelliJ Platform test scaffolding (instrumented test classes) links
  // against JUnit 4; keep it resolvable on the runtime classpath even though our
  // tests are JUnit 5.
  testRuntimeOnly("junit:junit:4.13.2")

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
  // The platform test framework (auto-engaged via a JUnit launcher listener,
  // e.g. ThreadLeakTracker) reflects into the JDK. Stripping the platform's
  // argument provider above also strips the --add-opens it normally supplies, so
  // re-add the standard set that framework needs.
  jvmArgs(
    "--add-opens=java.base/java.lang=ALL-UNNAMED",
    "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
    "--add-opens=java.base/java.util=ALL-UNNAMED",
    "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED",
    "--add-opens=java.base/java.io=ALL-UNNAMED",
    "--add-opens=java.base/java.net=ALL-UNNAMED",
    "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED",
    "--add-opens=java.desktop/java.awt=ALL-UNNAMED",
    "--add-opens=java.desktop/java.awt.event=ALL-UNNAMED",
    "--add-opens=java.desktop/javax.swing=ALL-UNNAMED",
    "--add-opens=java.desktop/sun.awt=ALL-UNNAMED",
    "--add-opens=java.desktop/sun.font=ALL-UNNAMED",
  )
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
