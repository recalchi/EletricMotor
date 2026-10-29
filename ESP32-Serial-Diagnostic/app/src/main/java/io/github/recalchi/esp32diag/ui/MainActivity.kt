package io.github.recalchi.esp32diag.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import io.github.recalchi.esp32diag.DiagApp
import io.github.recalchi.esp32diag.DiagController
import io.github.recalchi.esp32diag.core.DiagState
import io.github.recalchi.esp32diag.core.Step
import java.io.File

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var bar: ProgressBar
    private lateinit var stepsView: TextView
    private lateinit var resultView: TextView
    private lateinit var startBtn: Button
    private lateinit var shareBtn: Button
    private lateinit var saveBtn: Button
    private lateinit var wifiBtn: Button
    private lateinit var deleteBtn: Button

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun text(size: Float, bold: Boolean = false, mono: Boolean = false) = TextView(this).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        setTextColor(Color.parseColor("#1B1B1F"))
        if (bold) setTypeface(typeface, Typeface.BOLD)
        if (mono) typeface = Typeface.MONOSPACE
        setTextIsSelectable(false)
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(8) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#F6F7F9"))
            isFillViewport = true
            addView(col, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        val pad = dp(16)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            col.setPadding(pad + b.left, pad + b.top, pad + b.right, pad + b.bottom)
            insets
        }
        col.setPadding(pad, pad, pad, pad)

        col.addView(text(22f, bold = true).apply { text = "Diagnóstico do ESP32 (USB)" })
        col.addView(text(14f).apply {
            text = "1. Conecte o ESP32 ao celular com cabo USB de DADOS (use adaptador OTG se precisar).\n" +
                "2. Toque em Iniciar e, se o Android perguntar, permita o acesso USB.\n" +
                "O app só LÊ a porta serial: não envia dados, não reseta e não grava nada na placa."
            setPadding(0, dp(8), 0, dp(12))
        })
        status = text(18f, bold = true).apply { text = DiagState.IDLE.label }
        col.addView(status)
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(12)).apply { topMargin = dp(8); bottomMargin = dp(8) }
        }
        col.addView(bar)
        startBtn = button("Iniciar diagnóstico") {
            if (DiagController.running) DiagController.cancel() else DiagController.start(this)
        }
        col.addView(startBtn)

        stepsView = text(13f, mono = true).apply { setPadding(0, dp(12), 0, dp(8)) }
        col.addView(stepsView)
        resultView = text(15f).apply {
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setBackgroundColor(Color.WHITE)
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { bottomMargin = dp(8) }
        }
        col.addView(resultView)

        shareBtn = button("Exportar diagnóstico (compartilhar ZIP)") { share() }
        saveBtn = button("Salvar ZIP em uma pasta…") { saveAs() }
        wifiBtn = button("Diagnóstico Wi-Fi (opcional)") { confirmWifi() }
        deleteBtn = button("Excluir relatórios salvos") { confirmDelete() }
        listOf(shareBtn, saveBtn, wifiBtn, deleteBtn).forEach { col.addView(it) }
        col.addView(text(12f).apply {
            text = "Nada é enviado a servidores. O ZIP só sai do celular se você compartilhar."
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, 0)
        })
        setContentView(scroll)
    }

    override fun onStart() {
        super.onStart()
        DiagController.onChange = { render() }
        render()
    }

    override fun onStop() {
        DiagController.onChange = null
        super.onStop()
    }

    private fun render() {
        val running = DiagController.running
        val rep = DiagController.report
        val zip = DiagController.zipFile
        val busy = running || DiagController.wifiRunning

        val label = when {
            DiagController.wifiRunning -> "Diagnóstico Wi-Fi em andamento…"
            rep != null && !running -> rep.outcome.label
            else -> DiagController.state.label
        }
        setIfChanged(status, label)
        window.decorView.keepScreenOn = busy
        if (bar.progress != DiagController.progress) bar.progress = DiagController.progress
        startBtn.text = if (running) "Cancelar" else "Iniciar diagnóstico"
        startBtn.isEnabled = !DiagController.wifiRunning

        setIfChanged(stepsView, DiagController.steps.joinToString("\n") { fmt(it) })

        val sb = StringBuilder()
        if (rep != null && !running) {
            sb.append(rep.headline).append("\nConfiança: ").append(rep.confidence.label).append("\n\n")
            rep.conclusions.forEach { sb.append("• ").append(it).append('\n') }
            sb.append("\nPróximos passos:\n")
            rep.nextSteps.forEachIndexed { i, s -> sb.append("${i + 1}. ").append(s).append('\n') }
            rep.analyses.lastOrNull { it.preview.isNotBlank() }?.let {
                sb.append("\nAmostra da saída (${it.baud} baud):\n").append(it.preview.take(300)).append('\n')
            }
            DiagController.wifi?.let { w ->
                sb.append("\nWi-Fi: gateway ${w.gateway ?: "?"}, TCP 80: ${w.tcp80}")
                w.httpStatusLine?.let { sb.append(", HTTP: $it") }
                sb.append('\n')
                w.notes.forEach { sb.append("• ").append(it).append('\n') }
            }
        }
        DiagController.lastError?.let { sb.append("\n⚠ ").append(it).append('\n') }
        setIfChanged(resultView, sb.toString().trimEnd())
        resultView.visibility = if (sb.isEmpty()) View.GONE else View.VISIBLE

        val hasZip = zip?.exists() == true
        shareBtn.isEnabled = hasZip && !busy
        saveBtn.isEnabled = hasZip && !busy
        wifiBtn.isEnabled = rep != null && !busy
        deleteBtn.isEnabled = !busy
    }

    private fun setIfChanged(tv: TextView, s: String) {
        if (tv.text.toString() != s) tv.text = s
    }

    private fun fmt(s: Step) = "${s.status.symbol} ${s.title}\n    ${s.detail}"

    private fun share() {
        val f = DiagController.zipFile ?: return
        try {
            val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "application/zip"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "Diagnóstico ESP32 — ${f.name}")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, "Enviar diagnóstico"))
        } catch (e: Exception) {
            DiagApp.log.e("ui", "falha ao compartilhar", e)
            Toast.makeText(this, "Não foi possível compartilhar: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    @Suppress("DEPRECATION")
    private fun saveAs() {
        val f = DiagController.zipFile ?: return
        val i = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/zip"
            putExtra(Intent.EXTRA_TITLE, f.name)
        }
        try {
            startActivityForResult(i, REQ_SAVE)
        } catch (e: Exception) {
            Toast.makeText(this, "Sem seletor de arquivos disponível.", Toast.LENGTH_LONG).show()
        }
    }

    @Deprecated("API simples sem AndroidX Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_SAVE || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        val f: File = DiagController.zipFile ?: return
        try {
            contentResolver.openOutputStream(uri)?.use { out -> f.inputStream().use { it.copyTo(out) } }
                ?: error("destino indisponível")
            Toast.makeText(this, "ZIP salvo.", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            DiagApp.log.e("ui", "falha ao salvar ZIP", e)
            Toast.makeText(this, "Falha ao salvar: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun confirmWifi() {
        AlertDialog.Builder(this)
            .setTitle("Diagnóstico Wi-Fi (opcional)")
            .setMessage(
                "Conecte antes o celular à rede Wi-Fi do ESP32 (ex.: ESP_32BDD).\n\n" +
                    "O app vai ler o IP/gateway que o Android recebeu, abrir UMA conexão TCP na porta 80 do gateway " +
                    "e, se abrir, enviar UM “GET /”. Não envia comandos nem mexe no firmware.\n\nContinuar?"
            )
            .setPositiveButton("Continuar") { _, _ -> DiagController.runWifi(this) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun confirmDelete() {
        AlertDialog.Builder(this)
            .setTitle("Excluir relatórios")
            .setMessage("Apagar todos os relatórios salvos neste aparelho? (Cópias que você já compartilhou não são afetadas.)")
            .setPositiveButton("Excluir") { _, _ ->
                val n = DiagController.deleteReports(this)
                Toast.makeText(this, "$n arquivo(s) excluído(s).", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    companion object {
        private const val REQ_SAVE = 42
    }
}
