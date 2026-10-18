plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// CI / release inputs: Gradle property (-PNAME=…) or environment variable. All optional.
fun input(name: String): String? =
    (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: System.getenv(name)?.takeIf { it.isNotBlank() }

val keystorePath = input("IRONTERM_KEYSTORE")

android {
    namespace = "dev.ironterm"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.ironterm"
        minSdk = 26
        targetSdk = 35
        versionCode = input("IRONTERM_VERSION_CODE")?.toInt() ?: 2
        versionName = input("IRONTERM_VERSION_NAME") ?: "2.0"
        // GitHub repo whose Releases the in-app updater reads (forks: set IRONTERM_UPDATE_REPO).
        buildConfigField("String", "UPDATE_REPO", "\"${input("IRONTERM_UPDATE_REPO") ?: "Rjected/ironterm"}\"")
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = input("IRONTERM_KEYSTORE_PASSWORD")
                keyAlias = input("IRONTERM_KEY_ALIAS")
                keyPassword = input("IRONTERM_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // Not minified: kotlinx.serialization/Glance keep rules haven't been verified.
            isMinifyEnabled = false
            // Signed only when the keystore env vars are set (CI); otherwise an unsigned APK.
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all {
                // Screenshot tests always write PNGs (no golden comparison): docs/screens/android
                it.systemProperty("roborazzi.test.record", "true")
                it.systemProperty("screens.dir", rootProject.file("../docs/screens/android").absolutePath)
                it.systemProperty("previews.dir", rootProject.file("app/src/main/res/drawable-nodpi").absolutePath)
                it.maxHeapSize = "3g"
            }
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    testImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // Advanced setup (web) in a Custom Tab; server-rendered body figure (SVG)
    implementation("androidx.browser:browser:1.8.0")
    implementation("com.caverock:androidsvg-aar:1.4")

    // Widgets
    implementation("androidx.glance:glance-appwidget:1.1.1")

    // Networking + JSON
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Background refresh
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // QR connect: Google code scanner (Play services UI, no CAMERA permission)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    // Encrypted credentials
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Tests
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core-ktx:1.6.1")
    testImplementation("androidx.test.ext:junit:1.2.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.39.0")
    testImplementation("io.github.takahirom.roborazzi:roborazzi-compose:1.39.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}
