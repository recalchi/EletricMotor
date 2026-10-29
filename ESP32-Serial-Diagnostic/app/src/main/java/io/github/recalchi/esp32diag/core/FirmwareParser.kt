package io.github.recalchi.esp32diag.core

/** O que dá para deduzir do log de boot do ESP32. Tudo é inferência a partir de texto recebido. */
data class FirmwareInfo(
    val resetReason: String?,
    val bootMode: String?,
    val flashSize: String?,
    val flashMode: String?,
    val flashSpeed: String?,
    val idfVersion: String?,
    val chipRevision: String?,
    val partitions: List<String>,
    val moduleName: String?,
    val espAt: Boolean,
    val evidence: List<String>
) {
    fun lines(): List<String> {
        val out = mutableListOf<String>()
        out += "Boot: reset ${resetReason ?: "n/d"}, modo ${bootMode ?: "n/d"}; flash ${flashSize ?: "n/d"} ${flashMode ?: ""} ${flashSpeed ?: ""}".trim() +
            "; bootloader ESP-IDF ${idfVersion ?: "n/d"}; chip revision ${chipRevision ?: "n/d"}."
        if (partitions.isNotEmpty()) out += "Partições na flash: ${partitions.joinToString(", ")}."
        return out
    }
}

object FirmwareParser {
    private val ansi = Regex("\u001B\\[[0-9;]*m")
    private val reset = Regex("rst:0x([0-9a-fA-F]+)\\s*\\(([A-Z_0-9]+)\\)")
    private val boot = Regex("boot:0x([0-9a-fA-F]+)\\s*\\(([A-Z_0-9]+)\\)")
    private val flashSize = Regex("Flash Size\\s*:\\s*(\\S+)")
    private val flashMode = Regex("SPI Mode\\s*:\\s*(\\S+)")
    private val flashSpeed = Regex("SPI Speed\\s*:\\s*(\\S+)")
    private val idf = Regex("ESP-IDF\\s+(\\S+)\\s+2nd stage bootloader")
    private val chipRev = Regex("chip revision:\\s*(\\d+)")
    private val partition = Regex("boot:\\s+\\d+\\s+([A-Za-z0-9_]+)\\s+")
    private val module = Regex("module_name:(\\S+)")

    /** Retorna null se o texto não parece um log de boot do ESP32. */
    fun parse(raw: String): FirmwareInfo? {
        val t = ansi.replace(raw, "")
        val rst = reset.find(t)
        if (rst == null && !t.contains("ESP-IDF") && !t.contains("boot:")) return null
        val parts = partition.findAll(t).map { it.groupValues[1] }.distinct().toList()
        val mod = module.find(t)?.groupValues?.get(1)
        val evidence = mutableListOf<String>()
        if ("at_customize" in parts) evidence += "partição at_customize"
        if (mod != null) evidence += "linha module_name:$mod"
        if (t.contains("AT version")) evidence += "texto 'AT version'"
        return FirmwareInfo(
            resetReason = rst?.let { "${it.groupValues[2]} (0x${it.groupValues[1]})" },
            bootMode = boot.find(t)?.let { "${it.groupValues[2]} (0x${it.groupValues[1]})" },
            flashSize = flashSize.find(t)?.groupValues?.get(1),
            flashMode = flashMode.find(t)?.groupValues?.get(1),
            flashSpeed = flashSpeed.find(t)?.groupValues?.get(1),
            idfVersion = idf.find(t)?.groupValues?.get(1),
            chipRevision = chipRev.find(t)?.groupValues?.get(1),
            partitions = parts,
            moduleName = mod,
            espAt = evidence.isNotEmpty(),
            evidence = evidence
        )
    }
}
