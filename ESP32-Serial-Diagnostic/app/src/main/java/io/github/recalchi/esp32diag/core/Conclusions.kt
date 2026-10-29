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
        errorDetail: String?
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
            val best = analyses.filter { it.kind == Kind.TEXT }.maxByOrNull { it.totalBytes }!!
            val concl = mutableListOf(
                "Texto legível recebido a ${best.baud} baud: ${best.totalBytes} bytes, ${best.lineCount} linhas.",
                "A comunicação USB-serial com o ESP32 está funcionando (somente leitura)."
            )
            if (best.baud != cfg.baud) concl += "Atenção: a velocidade que funcionou NÃO é a padrão (${cfg.baud})."
            best.signatures.forEach { concl += "Detectado: $it." }
            Result(
                "Recebemos dados do ESP32 (${best.baud} baud).",
                if (best.signatures.isNotEmpty()) Confidence.ALTA else Confidence.MEDIA,
                concl,
                listOf(SEND_HINT)
            )
        }
    }
}
