package io.github.recalchi.esp32diag.core

/** Remove segredos e identificadores de textos que vão para o relatório. */
object Redactor {
    private val secretKv = Regex(
        """(?i)("?(?:pass(?:word|wd)?|senha|token|secret|api[_-]?key|authorization|bearer)"?)\s*[:=]\s*"?(?:bearer\s+)?[^\s,"'}]+"""
    )
    private val bearer = Regex("""(?i)\bbearer\s+(?!<redigido>)[A-Za-z0-9._~+/=-]+""")
    private val ssidKv = Regex("""(?i)("?ssid"?)\s*[:=]\s*"?([^"\r\n,}]*)"?""")
    private val email = Regex("""[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}""")
    private val mac = Regex("""\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b""")
    private val ipv4 = Regex("""\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b""")

    fun isPrivateIpv4(a: Int, b: Int): Boolean =
        a == 10 || a == 127 || (a == 192 && b == 168) || (a == 172 && b in 16..31) || (a == 169 && b == 254)

    fun text(input: String): String {
        var s = secretKv.replace(input) { "${it.groupValues[1]}=<redigido>" }
        s = bearer.replace(s, "Bearer <redigido>")
        s = ssidKv.replace(s) { m ->
            val value = m.groupValues[2].trim()
            if (value.startsWith("ESP", ignoreCase = true) || value.startsWith("<")) m.value
            else "${m.groupValues[1]}=<ssid-redigido>"
        }
        s = email.replace(s, "<email-redigido>")
        s = mac.replace(s, "xx:xx:xx:xx:xx:xx")
        s = ipv4.replace(s) { m ->
            val parts = m.groupValues.drop(1).map { it.toInt() }
            when {
                parts.any { it > 255 } -> m.value
                isPrivateIpv4(parts[0], parts[1]) -> m.value
                else -> "<ip-público>"
            }
        }
        return s
    }
}
