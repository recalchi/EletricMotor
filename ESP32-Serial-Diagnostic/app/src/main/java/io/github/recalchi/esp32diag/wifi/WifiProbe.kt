package io.github.recalchi.esp32diag.wifi

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.os.Build
import io.github.recalchi.esp32diag.core.AppLog
import io.github.recalchi.esp32diag.core.Redactor
import io.github.recalchi.esp32diag.core.WifiResult
import java.net.Inet4Address
import java.net.InetSocketAddress

/**
 * Diagnóstico Wi-Fi OPCIONAL e não invasivo: lê IP/gateway que o Android já recebeu por DHCP,
 * faz UMA conexão TCP à porta 80 do gateway (somente se for endereço privado) e, se abrir,
 * UM "GET /". Não envia comandos, não varre portas e não toca no firmware.
 */
class WifiProbe(context: Context, private val log: AppLog) {
    private val cm = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    @Suppress("DEPRECATION")
    fun run(): WifiResult {
        val now = System.currentTimeMillis()
        val notes = mutableListOf<String>()
        val wifi: Network? = cm.allNetworks.firstOrNull {
            cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        }
        if (wifi == null) {
            return WifiResult(now, false, "n/a", null, null, false, "não testado", null, null, null,
                listOf("O celular não está conectado a nenhuma rede Wi-Fi. Conecte-se à rede do ESP32 e repita."))
        }
        val lp = cm.getLinkProperties(wifi)
        val local = lp?.linkAddresses?.map { it.address }?.filterIsInstance<Inet4Address>()?.firstOrNull()?.hostAddress
        val gateway = lp?.routes?.mapNotNull { it.gateway }?.filterIsInstance<Inet4Address>()
            ?.firstOrNull { !it.isAnyLocalAddress }?.hostAddress
        if (gateway == null) notes += "O Android não informou gateway para esta rede."

        // SSID só é exibido se for de uma rede "ESP*"; qualquer outra é omitida (privacidade).
        val ssidRaw = if (Build.VERSION.SDK_INT >= 29) {
            (cm.getNetworkCapabilities(wifi)?.transportInfo as? WifiInfo)?.ssid?.trim('"')
        } else {
            null
        }
        val ssidInfo = when {
            ssidRaw == null || ssidRaw == "<unknown ssid>" -> "não lido (Android oculta sem permissão de localização)"
            ssidRaw.startsWith("ESP", ignoreCase = true) -> ssidRaw
            else -> "omitido (rede não-ESP)"
        }

        val gwPrivate = gateway?.split('.')?.let { p ->
            p.size == 4 && Redactor.isPrivateIpv4(p[0].toInt(), p[1].toInt())
        } ?: false
        if (gateway != null && !gwPrivate) notes += "Gateway não é endereço privado: sondagem recusada por segurança."
        if (gateway == null || !gwPrivate) {
            return WifiResult(now, true, ssidInfo, local, gateway, gwPrivate, "não testado", null, null, null, notes)
        }

        var tcp = "falhou"
        var status: String? = null
        var headers: String? = null
        var body: String? = null
        try {
            wifi.socketFactory.createSocket().use { s ->
                s.connect(InetSocketAddress(gateway, 80), 3000)
                tcp = "conectou"
                s.soTimeout = 3000
                s.getOutputStream().write(
                    "GET / HTTP/1.0\r\nHost: $gateway\r\nUser-Agent: ESP32-Serial-Diagnostic\r\nConnection: close\r\n\r\n"
                        .toByteArray(Charsets.US_ASCII)
                )
                s.getOutputStream().flush()
                val buf = ByteArray(2048)
                val n = try { s.getInputStream().read(buf) } catch (_: java.net.SocketTimeoutException) { -1 }
                if (n > 0) {
                    val text = String(buf, 0, n, Charsets.ISO_8859_1)
                    val parts = text.split("\r\n\r\n", limit = 2)
                    val headLines = parts[0].split("\r\n")
                    status = headLines.firstOrNull()
                    headers = headLines.drop(1).joinToString("\n")
                    body = parts.getOrNull(1)?.take(200)
                } else {
                    notes += "Porta 80 abriu, mas não houve resposta HTTP em 3s."
                }
            }
        } catch (e: Exception) {
            tcp = "falhou: ${e.javaClass.simpleName}: ${e.message}"
            log.w("wifi", "TCP 80 falhou", e)
            notes += "Sem servidor na porta 80 de $gateway (ou bloqueado). Isso não prova defeito no ESP32: o firmware pode não ter servidor web."
        }
        return WifiResult(now, true, ssidInfo, local, gateway, true, tcp, status, headers, body, notes)
    }
}
