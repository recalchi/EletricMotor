package io.github.recalchi.esp32diag.core

import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Máquina de estados do diagnóstico. Executa de forma síncrona (chame em thread de trabalho).
 * Só LÊ da porta serial: a interface [SerialSession] não possui escrita, reset ou controle de DTR/RTS.
 */
class DiagnosticRunner(
    private val gateway: UsbGateway,
    private val clock: Clock,
    private val log: AppLog,
    private val cfg: DiagConfig = DiagConfig(),
    private val listener: Listener = Listener.NONE
) {
    interface Listener {
        fun onState(state: DiagState)
        fun onProgress(percent: Int)
        fun onStep(step: Step)

        companion object {
            val NONE = object : Listener {
                override fun onState(state: DiagState) {}
                override fun onProgress(percent: Int) {}
                override fun onStep(step: Step) {}
            }
        }
    }

    private class CancelledException : RuntimeException()
    private class DisconnectedException : RuntimeException()

    private class Ctx {
        val steps = ArrayList<Step>()
        var devices: List<UsbDeviceInfo> = emptyList()
        var selected: UsbDeviceInfo? = null
        var driver: String? = null
        var strategy: ProbeStrategy = ProbeStrategy.DEFAULT
        var permission = "não solicitada"
        var controlLines: String? = null
        var reconnects = 0
        val captures = ArrayList<SerialCapture>()
        val analyses = ArrayList<Analysis>()
        var outcome: Outcome = Outcome.INTERNAL_ERROR
        var errorDetail: String? = null
        var currentBaud = 0
        var chip: String? = null
        var resetPrompted = false
        var bannerAtMs = -1L
        val readbacks = ArrayList<String>()
    }

    private companion object {
        const val HEAD_RAW_BYTES = 4096
    }

    @Volatile private var cancelled = false
    @Volatile private var session: SerialSession? = null

    fun cancel() {
        cancelled = true
        try {
            session?.close()
        } catch (_: Exception) {
        }
    }

    fun run(): DiagReport {
        val started = clock.now()
        val ctx = Ctx()
        try {
            doRun(ctx)
        } catch (_: CancelledException) {
            ctx.outcome = Outcome.CANCELLED
        } catch (_: InterruptedException) {
            ctx.outcome = Outcome.CANCELLED
        } catch (_: DisconnectedException) {
            ctx.outcome = Outcome.DISCONNECTED
        } catch (t: Throwable) {
            log.e("runner", "erro inesperado", t)
            ctx.outcome = Outcome.INTERNAL_ERROR
            ctx.errorDetail = t.toString()
        } finally {
            closeSession()
        }
        state(if (ctx.outcome == Outcome.CANCELLED) DiagState.CANCELLED else if (ctx.outcome == Outcome.INTERNAL_ERROR) DiagState.ERROR else DiagState.FINISHED)
        progress(100)
        return buildReport(ctx, started)
    }

    // ---------------------------------------------------------------- fluxo

    private fun doRun(ctx: Ctx) {
        // 1) Inventário USB (com pequena espera para o usuário conectar o cabo)
        state(DiagState.DETECTING)
        progress(3)
        var t = clock.now()
        var devices = gateway.listDevices()
        val waitEnd = t + cfg.attachWaitMs
        while (devices.isEmpty() && clock.now() < waitEnd) {
            checkCancel()
            clock.sleep(500)
            devices = gateway.listDevices()
        }
        ctx.devices = devices
        if (devices.isEmpty()) {
            record(ctx, "usb_inventory", "Inventário USB", StepStatus.FAIL,
                "O Android não listou nenhum dispositivo USB em ${cfg.attachWaitMs / 1000}s.", t)
            ctx.outcome = Outcome.NO_DEVICE
            return
        }
        record(ctx, "usb_inventory", "Inventário USB", StepStatus.OK,
            "${devices.size} dispositivo(s): " + devices.joinToString { it.vidPid + (if (it.isCp2102) " (CP2102)" else "") }, t,
            mapOf("count" to devices.size.toString()))

        // 2) Escolha do dispositivo/driver, com fallback de estratégia
        progress(10)
        t = clock.now()
        var chosen: UsbDeviceInfo? = null
        for (d in devices.sortedByDescending { it.isCp2102 }) {
            for (s in ProbeStrategy.values()) {
                if (s == ProbeStrategy.FORCE_CP21XX && !d.isCp2102) continue
                val name = gateway.probeDriver(d.id, s)
                log.i("driver", "${d.vidPid} estratégia=${s.name} -> ${name ?: "nenhum"}")
                if (name != null) {
                    chosen = d; ctx.driver = name; ctx.strategy = s
                    break
                }
            }
            if (chosen != null) break
        }
        if (chosen == null) {
            record(ctx, "driver", "Driver serial", StepStatus.FAIL,
                "Nenhum dos dispositivos USB tem driver serial compatível (CP21xx, CH34x, FTDI, CDC-ACM…).", t)
            ctx.outcome = Outcome.DRIVER_UNSUPPORTED
            return
        }
        ctx.selected = chosen
        record(ctx, "driver", "Driver serial", if (ctx.strategy == ProbeStrategy.DEFAULT) StepStatus.OK else StepStatus.WARN,
            "${chosen.vidPid} → ${ctx.driver} via ${ctx.strategy.label}", t,
            mapOf("driver" to ctx.driver!!, "strategy" to ctx.strategy.name))

        // 3) Permissão USB
        state(DiagState.PERMISSION)
        progress(15)
        t = clock.now()
        if (gateway.hasPermission(chosen.id)) {
            ctx.permission = "já concedida"
            record(ctx, "permission", "Permissão USB", StepStatus.OK, "Já concedida.", t)
        } else {
            when (gateway.requestPermission(chosen.id, cfg.permissionTimeoutMs)) {
                PermissionResult.GRANTED -> {
                    ctx.permission = "concedida pelo usuário"
                    record(ctx, "permission", "Permissão USB", StepStatus.OK, "Concedida.", t)
                }
                PermissionResult.DENIED -> {
                    ctx.permission = "negada"
                    record(ctx, "permission", "Permissão USB", StepStatus.FAIL, "O usuário negou o acesso USB.", t)
                    ctx.outcome = Outcome.PERMISSION_DENIED
                    return
                }
                PermissionResult.TIMEOUT -> {
                    ctx.permission = "sem resposta"
                    record(ctx, "permission", "Permissão USB", StepStatus.FAIL,
                        "A janela de permissão não foi respondida em ${cfg.permissionTimeoutMs / 1000}s.", t)
                    ctx.outcome = Outcome.PERMISSION_TIMEOUT
                    return
                }
            }
        }

        // 4) Abrir (com tentativas limitadas e backoff)
        state(DiagState.OPENING)
        progress(25)
        t = clock.now()
        var lastError = "desconhecido"
        var opened: SerialSession? = null
        var attempts = 0
        while (attempts < cfg.openAttempts && opened == null) {
            checkCancel()
            attempts++
            try {
                opened = openWithTimeout(chosen.id, ctx.strategy)
            } catch (e: UsbOpenException) {
                lastError = e.message ?: e.toString()
                log.w("open", "tentativa $attempts falhou: $lastError", e)
                if (attempts < cfg.openAttempts) clock.sleep(500L shl (attempts - 1))
            }
        }
        if (opened == null) {
            record(ctx, "open", "Abrir porta serial", StepStatus.FAIL,
                "Falhou após $attempts tentativa(s): $lastError", t, mapOf("attempts" to attempts.toString(), "error" to lastError))
            record(ctx, "fallback", "Coleta alternativa", StepStatus.OK,
                "Inventário USB, permissões e log do app foram salvos no relatório.", clock.now())
            ctx.outcome = Outcome.OPEN_FAILED
            return
        }
        session = opened
        record(ctx, "open", "Abrir porta serial", if (attempts == 1) StepStatus.OK else StepStatus.WARN,
            if (attempts == 1) "Porta aberta." else "Porta aberta na tentativa $attempts.", t,
            mapOf("attempts" to attempts.toString()))

        // 5) Configurar 115200 8N1
        state(DiagState.CONFIGURING)
        progress(30)
        t = clock.now()
        try {
            opened.configure(cfg.baud)
        } catch (e: Exception) {
            log.w("config", "falha ao configurar ${cfg.baud}", e)
            record(ctx, "config", "Configurar ${cfg.baud} 8N1", StepStatus.FAIL, "Falhou: ${e.message ?: e}", t)
            ctx.outcome = Outcome.OPEN_FAILED
            return
        }
        ctx.controlLines = opened.controlLinesReadOnly()
        val rb = readback(ctx, cfg.baud)
        record(ctx, "config", "Configurar ${cfg.baud} 8N1",
            if (rb?.baud != null && rb.baud != cfg.baud.toLong()) StepStatus.WARN else StepStatus.OK,
            "Configurada. Linhas de controle (somente leitura): ${ctx.controlLines ?: "indisponível"}. DTR/RTS não são alteradas pelo app." +
                (rb?.let { " Leitura de volta do chip: ${it.describe()}." } ?: ""), t)

        // 6) Escuta passiva a 115200
        state(DiagState.READING)
        capture(ctx, cfg.baud, cfg.readWindowMs, 30, 60)
        var best = ctx.analyses.last()

        // 7) Varredura passiva de outros bauds se não houve texto legível (para cedo se o fluxo impossível se repete)
        if (best.kind != Kind.TEXT && best.strongSignatures.isEmpty()) {
            state(DiagState.SCANNING_BAUD)
            val n = cfg.scanBauds.size
            var consecutiveAnomalies = if (best.anomalous) 1 else 0
            for ((i, baud) in cfg.scanBauds.withIndex()) {
                checkCancel()
                if (consecutiveAnomalies >= cfg.stopScanAfterAnomalies) {
                    record(ctx, "scan_skip", "Varredura restante", StepStatus.SKIPPED,
                        "Fluxo impossível idêntico em $consecutiveAnomalies velocidades seguidas; testar mais velocidades seria redundante.", clock.now())
                    break
                }
                val p0 = 60 + 25 * i / n
                val p1 = 60 + 25 * (i + 1) / n
                t = clock.now()
                try {
                    session!!.configure(baud)
                } catch (e: Exception) {
                    record(ctx, "scan_$baud", "Leitura a $baud baud", StepStatus.WARN, "Não foi possível configurar: ${e.message ?: e}", t)
                    continue
                }
                readback(ctx, baud)
                capture(ctx, baud, cfg.scanWindowMs, p0, p1)
                val a = ctx.analyses.last()
                if (a.kind == Kind.TEXT || a.strongSignatures.isNotEmpty()) break
                consecutiveAnomalies = if (a.anomalous) consecutiveAnomalies + 1 else 0
            }
        }

        // 8) Sem texto/assinatura: pede ao usuário que aperte EN/RESET FÍSICO (o app nunca reseta) e escuta.
        if (ctx.analyses.none { it.kind == Kind.TEXT || it.strongSignatures.isNotEmpty() }) {
            state(DiagState.PROMPT_RESET)
            ctx.resetPrompted = true
            t = clock.now()
            try {
                session!!.configure(cfg.baud)
                readback(ctx, cfg.baud)
                capture(ctx, cfg.baud, cfg.resetListenMs, 85, 99, stopOnAnomaly = false,
                    id = "read_reset_${cfg.baud}", untilBanner = true)
            } catch (e: IOException) {
                if (cancelled) throw CancelledException()
                record(ctx, "read_reset_${cfg.baud}", "Escuta após aviso de RESET", StepStatus.WARN, "Falhou: ${e.message ?: e}", t)
            }
        }

        val text = ctx.analyses.filter { it.kind == Kind.TEXT }.maxByOrNull { it.totalBytes }
        val strong = ctx.analyses.firstOrNull { it.strongSignatures.isNotEmpty() }
        ctx.outcome = when {
            text != null || strong != null -> Outcome.SERIAL_DATA_OK
            ctx.analyses.any { it.anomalous } -> Outcome.SERIAL_RATE_ANOMALY
            ctx.analyses.any { it.totalBytes > 0 } -> Outcome.SERIAL_GARBLED
            else -> Outcome.SERIAL_SILENT
        }
    }

    // ---------------------------------------------------------------- captura

    /** Lê de volta (GET) o que o chip aplicou; registra e devolve. Nunca escreve. */
    private fun readback(ctx: Ctx, requestedBaud: Int): ChipReadback? {
        val rb = try {
            session?.chipReadback()
        } catch (e: Exception) {
            log.w("readback", "falhou", e)
            null
        } ?: return null
        if (ctx.chip == null && rb.partName != null) ctx.chip = rb.partName
        val line = "pedido=$requestedBaud → ${rb.describe()}"
        ctx.readbacks.add(line)
        log.i("readback", line)
        return rb
    }

    private fun capture(
        ctx: Ctx, baud: Int, windowMs: Long, p0: Int, p1: Int,
        stopOnAnomaly: Boolean = true, id: String = "read_$baud", untilBanner: Boolean = false
    ) {
        ctx.currentBaud = baud
        val chunks = ArrayList<SerialChunk>()
        var total = 0
        var received = 0L
        var reads = 0
        var dups = 0
        var truncated = false
        var anomalous = false
        var lastTextCheck = 0L
        var last: ByteArray? = null
        var bannerAt = -1L
        val recent = StringBuilder()
        val sizes = HashMap<Int, Int>()
        val start = clock.now()
        val buf = ByteArray(4096)
        try {
            while (true) {
                checkCancel()
                val elapsed = clock.now() - start
                if (elapsed >= windowMs) break
                progress(p0 + ((p1 - p0) * elapsed / windowMs).toInt())
                java.util.Arrays.fill(buf, 0)   // descarta a hipótese de "buffer velho" sendo relido
                try {
                    val n = session!!.read(buf, 250)
                    if (n > 0) {
                        reads++
                        received += n
                        sizes.merge(n, 1, Int::plus)
                        val chunk = buf.copyOf(n)
                        // Após os primeiros 4 KB, pacotes idênticos ao anterior são só contados (evita inundar o relatório).
                        val dup = last != null && chunk.contentEquals(last) && total >= HEAD_RAW_BYTES
                        last = chunk
                        if (dup) {
                            dups++
                        } else {
                            val keep = minOf(n, cfg.maxCaptureBytes - total)
                            if (keep > 0) {
                                chunks.add(SerialChunk(clock.now() - start, if (keep == n) chunk else chunk.copyOf(keep)))
                                total += keep
                            }
                            if (keep < n) truncated = true
                            if (untilBanner) {
                                recent.append(String(chunk, Charsets.ISO_8859_1))
                                if (recent.length > 1024) recent.delete(0, recent.length - 1024)
                                if (bannerAt < 0 && SerialAnalyzer.STRONG_KEYS.any { recent.contains(it) }) {
                                    bannerAt = clock.now() - start
                                    ctx.bannerAtMs = bannerAt
                                }
                            }
                        }
                    }
                } catch (e: IOException) {
                    if (cancelled) throw CancelledException()
                    log.w("read", "falha de leitura a $baud baud: ${e.message}", e)
                    if (!recover(ctx, baud)) throw DisconnectedException()
                }
                val now = clock.now() - start
                if (bannerAt >= 0 && now - bannerAt >= 1500) break
                // Vazão acima do limite físico (+ folga do buffer do chip).
                if (now >= cfg.anomalyAfterMs && received > 4 * (physicalMaxBps(baud) * now / 1000 + 1024)) {
                    anomalous = true
                    if (stopOnAnomaly) break
                }
                // Parada antecipada apenas quando já há texto legível.
                if (!untilBanner && now >= 1000 && now - lastTextCheck >= 500 && total >= cfg.earlyTextBytes) {
                    lastTextCheck = now
                    if (SerialAnalyzer.analyze(baud, joinChunks(chunks)).kind == Kind.TEXT) break
                }
            }
        } finally {
            val dur = clock.now() - start
            val sizesText = sizes.entries.sortedByDescending { it.value }.take(3).joinToString(" ") { "${it.key}B×${it.value}" }
            val cap = SerialCapture(baud, start, dur, chunks, total, truncated, received, reads, anomalous, dups, sizesText)
            val a0 = SerialAnalyzer.analyze(baud, cap.allBytes())
            val a = a0.copy(
                rateBps = if (dur > 0) received * 1000 / dur else 0,
                physicalMaxBps = physicalMaxBps(baud),
                anomalous = anomalous
            )
            ctx.captures.add(cap)
            ctx.analyses.add(a)
            val inNoise = a.kind != Kind.TEXT && a.strongSignatures.isNotEmpty()
            val status = if (a.kind == Kind.TEXT || inNoise) StepStatus.OK else StepStatus.WARN
            val rate = "$received B em $dur ms (${a.rateBps} B/s; máximo físico a $baud baud ≈ ${a.physicalMaxBps} B/s; tamanhos de leitura: $sizesText)"
            val detail = when {
                inNoise -> "ASSINATURA DO ESP32 DENTRO DO FLUXO: " + a.strongSignatures.joinToString("; ") +
                    (bannerAt.let { if (it >= 0) " (em +${it} ms)" else "" }) + ". $rate."
                anomalous -> "FLUXO IMPOSSÍVEL: $rate." + (a.period?.let { " Padrão repetido a cada $it bytes." } ?: "")
                a.kind == Kind.EMPTY -> "Nenhum byte recebido em ${dur / 1000.0}s."
                a.kind == Kind.TOO_FEW -> "Apenas ${a.totalBytes} byte(s): insuficiente para avaliar."
                a.kind == Kind.GARBLED -> "${a.totalBytes} bytes, só ${(a.printableRatio * 100).toInt()}% legíveis (provável velocidade errada ou ruído)." +
                    (a.period?.let { " Padrão repetido a cada $it bytes." } ?: "")
                else -> "${a.totalBytes} bytes de texto legível (${a.lineCount} linhas)." +
                    if (a.signatures.isNotEmpty()) " Detectado: " + a.signatures.joinToString("; ") else ""
            }
            val title = if (id.startsWith("read_reset")) "Escuta após aviso de RESET ($baud baud)" else "Leitura passiva a $baud baud"
            record(ctx, id, title, status, detail, start,
                mapOf("bytes" to a.totalBytes.toString(), "received" to received.toString(), "kind" to a.kind.name,
                    "rateBps" to a.rateBps.toString(), "physicalMaxBps" to a.physicalMaxBps.toString(),
                    "anomalous" to anomalous.toString(), "period" to (a.period?.toString() ?: ""),
                    "distinct" to a.distinctBytes.toString(), "top" to a.topBytes,
                    "readSizes" to sizesText, "dupChunks" to dups.toString(),
                    "strongSignatures" to a.strongSignatures.joinToString("; ")))
        }
    }

    /** Vazão máxima teórica de uma UART 8N1 (10 bits por byte). */
    private fun physicalMaxBps(baud: Int): Long = baud / 10L

    private fun joinChunks(chunks: List<SerialChunk>): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        chunks.forEach { out.write(it.bytes) }
        return out.toByteArray()
    }

    /** Tenta reabrir após queda, com limite e backoff. Retorna true se retomou. */
    private fun recover(ctx: Ctx, baud: Int): Boolean {
        val dev = ctx.selected ?: return false
        closeSession()
        while (ctx.reconnects < cfg.maxReconnects) {
            checkCancel()
            ctx.reconnects++
            val t = clock.now()
            clock.sleep(1000L * ctx.reconnects)
            try {
                if (gateway.listDevices().none { it.id == dev.id }) {
                    record(ctx, "reconnect", "Reconexão", StepStatus.FAIL, "Dispositivo ${dev.vidPid} não está mais presente.", t)
                    continue
                }
                if (!gateway.hasPermission(dev.id)) {
                    record(ctx, "reconnect", "Reconexão", StepStatus.FAIL, "Permissão USB perdida após reconexão.", t)
                    return false
                }
                val s = openWithTimeout(dev.id, ctx.strategy)
                session = s
                s.configure(baud)
                record(ctx, "reconnect", "Reconexão", StepStatus.WARN, "Porta reaberta após queda (tentativa ${ctx.reconnects}).", t)
                return true
            } catch (e: Exception) {
                log.w("reconnect", "tentativa ${ctx.reconnects} falhou", e)
                record(ctx, "reconnect", "Reconexão", StepStatus.FAIL, "Tentativa ${ctx.reconnects} falhou: ${e.message ?: e}", t)
            }
        }
        return false
    }

    private fun openWithTimeout(id: String, strategy: ProbeStrategy): SerialSession {
        val ex = Executors.newSingleThreadExecutor { r -> Thread(r, "usb-open").apply { isDaemon = true } }
        val abandoned = AtomicBoolean(false)
        val future = ex.submit(Callable {
            val s = gateway.open(id, strategy)
            if (abandoned.get()) {
                try { s.close() } catch (_: Exception) {}
            }
            s
        })
        try {
            return future.get(cfg.openTimeoutMs, TimeUnit.MILLISECONDS)
        } catch (_: TimeoutException) {
            abandoned.set(true)
            future.cancel(true)
            throw UsbOpenException("tempo esgotado ao abrir (${cfg.openTimeoutMs} ms)")
        } catch (e: ExecutionException) {
            val c = e.cause
            throw (c as? UsbOpenException) ?: UsbOpenException(c?.message ?: e.toString(), c)
        } finally {
            ex.shutdown()
        }
    }

    // ---------------------------------------------------------------- utilidades

    private fun checkCancel() {
        if (cancelled) throw CancelledException()
    }

    private fun closeSession() {
        val s = session
        session = null
        try {
            s?.close()
        } catch (_: Exception) {
        }
    }

    private fun state(s: DiagState) {
        log.i("state", s.name)
        listener.onState(s)
    }

    private fun progress(p: Int) = listener.onProgress(p.coerceIn(0, 100))

    private fun record(ctx: Ctx, id: String, title: String, status: StepStatus, detail: String, startMs: Long,
                       evidence: Map<String, String> = emptyMap()) {
        val step = Step(id, title, status, detail, startMs, clock.now() - startMs, evidence)
        ctx.steps.add(step)
        log.i("step", "[${status.name}] $title — $detail")
        listener.onStep(step)
    }

    // ---------------------------------------------------------------- conclusões

    private fun buildReport(ctx: Ctx, started: Long): DiagReport {
        val c = Conclusions.build(ctx.outcome, ctx.devices, ctx.analyses, cfg, ctx.driver, ctx.errorDetail, ctx.chip, ctx.readbacks, ctx.resetPrompted)
        return DiagReport(
            startedAtMs = started,
            finishedAtMs = clock.now(),
            outcome = ctx.outcome,
            confidence = c.confidence,
            headline = c.headline,
            conclusions = c.conclusions,
            nextSteps = c.nextSteps,
            steps = ctx.steps.toList(),
            devices = ctx.devices,
            selectedDevice = ctx.selected,
            driver = ctx.driver,
            permissionState = ctx.permission,
            controlLines = ctx.controlLines,
            reconnects = ctx.reconnects,
            captures = ctx.captures.toList(),
            analyses = ctx.analyses.toList(),
            chip = ctx.chip,
            readbacks = ctx.readbacks.toList(),
            resetPrompted = ctx.resetPrompted,
            bannerAtMs = ctx.bannerAtMs
        )
    }
}
