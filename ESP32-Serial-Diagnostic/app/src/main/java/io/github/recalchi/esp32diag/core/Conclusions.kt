package io.github.recalchi.esp32diag.core

/** Texto do resultado: apenas o que as evidências sustentam, sem inventar causa raiz. */
object Conclusions {
    data class Result(
        val headline: String,
        val confidence: Confidence,
        val conclusions: List<String>,
        val nextSteps: List<String>
    )

    private const val WIFI_HINT =
        "Opcional: toque em “Diagnóstico Wi-Fi” com o celular conectado à rede do ESP32 (ex.: ESP_32BDD) para checar o IP e a porta 80."
    private const val SEND_HINT = "Toque em “Exportar diagnóstico” e envie o ZIP para análise."

    fun build(
        outcome: Outcome,
        devices: List<UsbDeviceInfo>,
        analyses: List<Analysis>,
        cfg: DiagConfig,
        driver: String?,
        errorDetail: String?,
        chip: String? = null,
        readbacks: List<String> = emptyList(),
        resetPrompted: Boolean = false,
        firmware: FirmwareInfo? = null,
        junkNote: String? = null
    ): Result = when (outcome) {
        Outcome.NO_DEVICE -> Result(
            "O Android não enxergou nenhum dispositivo USB.",
            Confidence.MEDIA,
            listOf(
                "Nenhum dispositivo apareceu na lista USB do Android em ${cfg.attachWaitMs / 1000}s.",
                "Costuma indicar cabo só de carga, adaptador OTG ausente/defeituoso ou porta sem modo host. Isso NÃO prova defeito no ESP32 — a rede Wi-Fi do ESP32 já observada indica que a placa liga e roda firmware."
            ),
            listOf(
                "Use um cabo USB de DADOS (teste o mesmo cabo em outro aparelho/PC).",
                "Se o celular só tem USB-C e a placa é micro-USB/USB-A, use um adaptador OTG.",
                "Reconecte o cabo com o app aberto e toque em Iniciar de novo.",
                WIFI_HINT,
                SEND_HINT
            )
        )
        Outcome.DRIVER_UNSUPPORTED -> Result(
            "Há dispositivo USB, mas nenhum driver serial compatível.",
            Confidence.MEDIA,
            listOf(
                "Dispositivos vistos: " + devices.joinToString { it.vidPid },
                "Nem a detecção padrão nem o fallback CP21xx reconheceram uma ponte USB-serial suportada."
            ),
            listOf("Envie o ZIP: o usb.json traz VID/PID, classes e endpoints para avaliar suporte.", SEND_HINT)
        )
        Outcome.PERMISSION_DENIED -> Result(
            "A permissão de acesso USB foi negada.",
            Confidence.ALTA,
            listOf("Sem permissão o Android não deixa o app abrir a porta."),
            listOf("Toque em Iniciar de novo e escolha “OK/Permitir” na janela do Android.", "Dica: marque “Usar por padrão para este dispositivo USB”.")
        )
        Outcome.PERMISSION_TIMEOUT -> Result(
            "A janela de permissão USB não foi respondida.",
            Confidence.MEDIA,
            listOf("O pedido expirou sem resposta (a janela pode ter ficado atrás de outro app)."),
            listOf("Toque em Iniciar de novo e responda à janela “Permitir que o app acesse o dispositivo USB”.")
        )
        Outcome.OPEN_FAILED -> Result(
            "O dispositivo foi reconhecido, mas a porta serial não abriu.",
            Confidence.MEDIA,
            listOf(
                "Driver ${driver ?: "?"} escolhido e permissão concedida, porém a abertura/configuração falhou nas tentativas permitidas.",
                "Possíveis causas: outro app segurando a porta, cabo com mau contato, falha do firmware USB da ponte. A causa exata não foi determinada."
            ),
            listOf("Feche outros apps seriais (ex.: Serial USB Terminal), reconecte o cabo e tente de novo.", SEND_HINT)
        )
        Outcome.DISCONNECTED -> Result(
            "O dispositivo USB foi desconectado durante a leitura.",
            Confidence.MEDIA,
            listOf("A leitura caiu e as reconexões automáticas (limitadas) não resolveram.", "Quedas assim apontam para cabo/OTG instável ou alimentação insuficiente."),
            listOf("Troque o cabo/adaptador, evite hubs e repita.", SEND_HINT)
        )
        Outcome.CANCELLED -> Result(
            "Diagnóstico cancelado.", Confidence.BAIXA,
            listOf("O diagnóstico foi interrompido antes de terminar; os dados parciais foram preservados."),
            listOf("Toque em Iniciar para repetir.")
        )
        Outcome.INTERNAL_ERROR -> Result(
            "Erro interno do aplicativo.", Confidence.BAIXA,
            listOf("Falha inesperada: ${errorDetail ?: "sem detalhe"}"),
            listOf("Exporte o diagnóstico: o app-log.txt traz o detalhe técnico.")
        )
        Outcome.SERIAL_SILENT -> Result(
            "Porta serial aberta com sucesso, mas o ESP32 não enviou nada.",
            Confidence.MEDIA,
            listOf(
                "A comunicação USB com a ponte (${driver ?: "?"}) funcionou: abertura e configuração ok.",
                "Nenhum byte em ${cfg.baud} baud nem em ${cfg.scanBauds.joinToString("/")} baud (leitura passiva).",
                "Causas possíveis (não distinguíveis só com esta coleta): firmware sem saída no UART0, mensagens só no boot (já passou), TX/RX da ponte não ligados ao chip, ou placa travada.",
                "Ausência de saída NÃO prova defeito na placa."
            ),
            listOf(
                "Com o app escutando, aperte o botão EN/RESET físico da placa (o app nunca reseta) e repita — o banner de boot costuma aparecer.",
                WIFI_HINT,
                SEND_HINT
            )
        )
        Outcome.SERIAL_RATE_ANOMALY -> {
            val a = analyses.first { it.anomalous }
            val applied = readbacks.any { r ->
                val req = Regex("pedido=(\\d+)").find(r)?.groupValues?.get(1)?.toLongOrNull()
                val got = Regex("baud lido=(\\d+)").find(r)?.groupValues?.get(1)?.toLongOrNull()
                req != null && got != null && req == got
            }
            val concl = mutableListOf(
                "A ponte USB entregou ${a.rateBps} B/s a ${a.baud} baud, mas uma UART só consegue ≈ ${a.physicalMaxBps} B/s nessa velocidade. " +
                    "Logo o fluxo NÃO é texto serial normal nessa configuração.",
                "Isso se repetiu em ${analyses.count { it.anomalous }} de ${analyses.size} velocidades testadas" +
                    (if (analyses.all { it.anomalous }) " (a velocidade configurada parece não surtir efeito)." else "."),
                a.period?.let { "O conteúdo é um padrão que se repete a cada $it bytes (${a.distinctBytes} valores distintos) — típico de sinal periódico/ruído, não de log de texto." }
                    ?: "Conteúdo sem texto legível (${a.distinctBytes} valores distintos).",
                if (chip != null) "Chip identificado: $chip." else "Modelo exato do chip não pôde ser lido.",
                if (readbacks.isEmpty()) "Não foi possível ler de volta do chip o baud aplicado."
                else if (applied) "O chip confirmou o baud pedido, então o excesso de dados vem da linha RX (ruído/sinal rápido), não de baud ignorado."
                else "A leitura de volta do chip NÃO confirmou o baud pedido: ${readbacks.first()}",
                if (resetPrompted) "O app pediu para apertar EN/RESET e escutou ${cfg.resetListenMs / 1000}s a ${cfg.baud} baud: NENHUM banner de boot do ESP32 apareceu no fluxo. " +
                    "Se você apertou o botão, ou o TX do ESP32 não chega ao chip, ou o fluxo do chip encobre a UART." else "O teste de RESET manual não foi executado.",
                "Causa raiz não determinada: pode ser TX do ESP32 emitindo fluxo rápido contínuo (ex.: protocolo binário de alta velocidade), linha RX flutuando/em curto, ou chip/clone com comportamento atípico."
            )
            Result(
                "O fluxo recebido é rápido demais para ser serial de texto: algo está errado na linha ou no baud.",
                Confidence.MEDIA,
                concl,
                listOf(
                    "Envie o ZIP: serial.txt e summary.json agora trazem vazão, período do padrão e leitura de volta do chip.",
                    "Para separar 'placa' de 'celular': plugue a MESMA placa no PC e abra um monitor serial a 115200 (ex.: Arduino IDE) — se mostrar texto normal, o problema está no celular/cabo/app; se mostrar o mesmo lixo, está na placa/firmware.",
                    "Se puder, teste outro cabo e outra porta; evite hubs.",
                    SEND_HINT
                )
            )
        }
        Outcome.SERIAL_GARBLED -> Result(
            "Chegaram bytes, mas ilegíveis em todas as velocidades testadas.",
            Confidence.MEDIA,
            listOf(
                "Bytes por velocidade: " + analyses.joinToString { "${it.baud}→${it.totalBytes}B/${(it.printableRatio * 100).toInt()}%" },
                "A comunicação física existe. Pode ser velocidade fora da lista testada, firmware usando outro baud, ou ruído. Causa não determinada."
            ),
            listOf("Envie o ZIP: o serial.txt traz o hexdump para identificar a velocidade correta.", SEND_HINT)
        )
        Outcome.SERIAL_DATA_OK -> {
            val best = analyses.filter { it.kind == Kind.TEXT }.maxByOrNull { it.totalBytes }
                ?: analyses.first { it.strongSignatures.isNotEmpty() }
            val concl = mutableListOf<String>()
            if (best.kind == Kind.TEXT) {
                concl += "Texto legível recebido a ${best.baud} baud: ${best.totalBytes} bytes, ${best.lineCount} linhas."
                concl += "A comunicação USB-serial com o ESP32 está funcionando (somente leitura)."
            } else {
                concl += "Assinatura de boot do ESP32 detectada a ${best.baud} baud DENTRO de um fluxo ruidoso."
                concl += "Isso PROVA que a UART do ESP32 chega ao celular em ${best.baud} baud; o lixo constante é gerado à parte (provável comportamento do chip/cabo quando a linha está ociosa)."
            }
            if (best.baud != cfg.baud) concl += "Atenção: a velocidade que funcionou NÃO é a padrão (${cfg.baud})."
            best.signatures.forEach { concl += "Detectado: $it." }
            if (junkNote != null) concl += "O chip/cabo também emitiu $junkNote em fluxo contínuo (≈ 260 KB/s), independente do baud; o app filtrou esse ruído e manteve só os dados reais."
            val next = mutableListOf<String>()
            if (firmware != null) {
                concl += firmware.lines()
                if (firmware.espAt) {
                    concl += "Indícios de firmware Espressif AT de fábrica (" + firmware.evidence.joinToString(", ") + "). " +
                        "É inferência pelo log de boot: o app não envia comandos AT para confirmar."
                    concl += "Em ESP-AT a porta de comandos AT costuma ficar na UART1 (GPIO16 RX / GPIO17 TX), não no conector USB; pelo USB normalmente saem só os logs de boot. " +
                        "Isso explica o silêncio depois do boot e a ausência de servidor web na rede do ESP32."
                    next += "Para usar esta placa com o app EletricMotor é preciso gravar o firmware gateway (pasta firmware/esp32-gateway) a partir do PC (Arduino IDE ou esptool). Este app NUNCA grava firmware."
                    next += "Se preferir manter o ESP-AT, os comandos AT precisam de um adaptador USB-serial separado ligado em GPIO16/GPIO17 (confirme os pinos no manual da sua versão)."
                }
            }
            next += SEND_HINT
            Result(
                "Recebemos dados do ESP32 (${best.baud} baud).",
                if (best.signatures.isNotEmpty()) Confidence.ALTA else Confidence.MEDIA,
                concl,
                next
            )
        }
    }
}
