package io.github.recalchi.esp32diag.core

enum class Kind { EMPTY, TOO_FEW, TEXT, GARBLED }

data class Analysis(
    val baud: Int,
    val totalBytes: Int,
    val printableRatio: Double,
    val lineCount: Int,
    val kind: Kind,
    val signatures: List<String>,
    val preview: String
)

object SerialAnalyzer {
    private val signatureTable = listOf(
        "rst:0x" to "Banner de boot do ROM do ESP32 (reset detectado na saída)",
        "ESP-ROM:" to "Banner de boot do ROM do ESP32",
        "waiting for download" to "ESP32 em modo de gravação (bootloader): GPIO0 baixo no boot",
        "Guru Meditation" to "Firmware travou (Guru Meditation Error)",
        "Brownout detector" to "Brownout: alimentação insuficiente/instável",
        "invalid header" to "Bootloader não achou firmware válido na flash",
        "flash read err" to "Falha de leitura da flash",
        "{\"v\":1" to "Mensagens EMGP v1 do firmware gateway (EletricMotor)",
        "I (" to "Logs ESP-IDF (nível info)",
        "E (" to "Logs de erro do ESP-IDF"
    )

    fun analyze(baud: Int, bytes: ByteArray): Analysis {
        if (bytes.isEmpty()) return Analysis(baud, 0, 0.0, 0, Kind.EMPTY, emptyList(), "")
        var printable = 0
        var lines = 0
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            if (v in 0x20..0x7E || v == 0x0A || v == 0x0D || v == 0x09) printable++
            if (v == 0x0A) lines++
        }
        val ratio = printable.toDouble() / bytes.size
        val text = String(bytes, Charsets.ISO_8859_1)
        val sigs = signatureTable.filter { text.contains(it.first) }.map { it.second }.distinct()
        val kind = when {
            bytes.size < 8 -> Kind.TOO_FEW
            ratio >= 0.85 -> Kind.TEXT
            else -> Kind.GARBLED
        }
        val preview = Redactor.text(
            text.take(400).map { c ->
                when {
                    c.code in 0x20..0x7E || c == '\n' -> c
                    c == '\r' || c == '\t' -> ' '
                    else -> '·'
                }
            }.joinToString("")
        )
        return Analysis(baud, bytes.size, ratio, lines, kind, sigs, preview)
    }
}
