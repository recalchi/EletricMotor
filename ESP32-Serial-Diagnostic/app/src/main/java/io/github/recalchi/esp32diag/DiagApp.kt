package io.github.recalchi.esp32diag

import android.app.Application
import io.github.recalchi.esp32diag.core.AppLog
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

class DiagApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val crashFile = File(filesDir, "last-crash.txt")
        if (crashFile.exists()) {
            try {
                log.e("crash", "Fechamento inesperado na execução anterior:\n" + crashFile.readText().take(6000))
                crashFile.delete()
            } catch (_: Exception) {
            }
        }
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val sw = StringWriter()
                e.printStackTrace(PrintWriter(sw))
                crashFile.writeText("thread=${t.name}\n$sw")
            } catch (_: Exception) {
            }
            previous?.uncaughtException(t, e)
        }
        log.i("app", "iniciado v${BuildConfigInfo.versionName(this)}")
    }

    companion object {
        /** Log único do processo; vai inteiro (redigido) para app-log.txt. */
        val log = AppLog()
    }
}

object BuildConfigInfo {
    fun versionName(app: android.content.Context): String = try {
        app.packageManager.getPackageInfo(app.packageName, 0).versionName ?: "?"
    } catch (_: Exception) {
        "?"
    }
}
