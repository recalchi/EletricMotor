plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.recalchi.esp32diag"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.recalchi.esp32diag"
        // Biblioteca pura Java/Kotlin (sem código nativo): independe de ABI.
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = false
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    // Driver USB-serial mantido (licença MIT). 3.11.0 = versão estável mais recente verificada.
    implementation("com.github.mik3y:usb-serial-for-android:3.11.0")
    // Apenas para FileProvider (compartilhar o ZIP).
    implementation("androidx.core:core:1.13.1")

    testImplementation("junit:junit:4.13.2")
    // org.json do Android é "stub" nos testes de JVM.
    testImplementation("org.json:json:20240303")
}
