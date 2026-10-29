package io.github.recalchi.esp32diag

import android.content.Context
import android.os.Handler
import android.os.Looper
import io.github.recalchi.esp32diag.core.DiagConfig
import io.github.recalchi.esp32diag.core.DiagReport
import io.github.recalchi.esp32diag.core.DiagState
import io.github.recalchi.esp32diag.core.DiagnosticRunner
import io.github.recalchi.esp32diag.core.Step
import io.github.recalchi.esp32diag.core.SystemClock
import io.github.recalchi.esp32diag.core.WifiResult
import io.github.recalchi.esp32diag.report.ReportStore
import io.github.recalchi.esp32diag.usb.AndroidUsbGateway
import io.github.recalchi.esp32diag.wifi.WifiProbe
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList

/** Estado único do processo (sobrevive à recriação da Activity). Escritas no worker, leituras na UI. */
object DiagController {
    private val main = Handler(Looper.getMainLooper())
    private val log get() = DiagApp.log

    @Volatile var state: DiagState = DiagState.IDLE; private set
    @Volatile var progress: Int = 0; private set
    @Volatile var running: Boolean = false; private set
    @Volatile var wifiRunning: Boolean = false; private set
    @Volatile var report: DiagReport? = null; private set
    @Volatile var wifi: WifiResult? = null; private set
    @Volatile var zipFile: File? = null; private set
    @Volatile var lastError: String? = null; private set
    val steps = CopyOnWriteArrayList<Step>()

    @Volatile var onChange: (() -> Unit)? = null
    @Volatile private var runner: DiagnosticRunner? = null

    private fun notifyUi() {
        main.post { onChange?.invoke() }
    }

    fun start(context: Context) {
        if (running) return
        val app = context.applicationContext
        running = true
        lastError = null
        report = null
        wifi = null
        zipFile = null
        steps.clear()
        progress = 0
        notifyUi()
        val r = DiagnosticRunner(AndroidUsbGateway(app, log), SystemClock, log, DiagConfig(), object : DiagnosticRunner.Listener {
            override fun onState(state: DiagState) { this@DiagController.state = state; notifyUi() }
            override fun onProgress(percent: Int) { progress = percent; notifyUi() }
            override fun onStep(step: Step) { steps.add(step); notifyUi() }
        })
        runner = r
        Thread({
            try {
                val rep = r.run()
                report = rep
                try {
                    zipFile = ReportStore.save(app, rep, null)
                } catch (e: Exception) {
                    log.e("report", "falha ao salvar ZIP", e)
                    lastError = "Não foi possível salvar o relatório: ${e.message}"
                }
            } catch (t: Throwable) {
                log.e("controller", "falha no diagnóstico", t)
                state = DiagState.ERROR
                lastError = "Erro inesperado: ${t.message ?: t}"
            } finally {
                running = false
                runner = null
                notifyUi()
            }
        }, "diag-runner").start()
    }

    fun cancel() {
        runner?.cancel()
    }

    fun runWifi(context: Context) {
        val rep = report ?: return
        if (wifiRunning || running) return
        val app = context.applicationContext
        wifiRunning = true
        notifyUi()
        Thread({
            try {
                val w = WifiProbe(app, log).run()
                wifi = w
                zipFile = ReportStore.save(app, rep, w, zipFile)
            } catch (t: Throwable) {
                log.e("wifi", "falha no diagnóstico Wi-Fi", t)
                lastError = "Falha no Wi-Fi: ${t.message ?: t}"
            } finally {
                wifiRunning = false
                notifyUi()
            }
        }, "diag-wifi").start()
    }

    fun deleteReports(context: Context): Int {
        val n = ReportStore.deleteAll(context.applicationContext)
        zipFile = null
        notifyUi()
        return n
    }
}
