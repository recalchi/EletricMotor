package io.github.recalchi.esp32diag.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticRunnerTest {
    private val clock = FakeClock()
    private val gw = FakeGateway(clock)

    private fun session(script: (Int, Int) -> ByteArray?) = FakeSession(clock, script = script)
    private fun run(cfg: DiagConfig = DiagConfig()) = runner(gw, clock, cfg).run()
    private fun DiagReport.step(id: String) = steps.first { it.id == id }

    @Test fun noDeviceWaitsThenReportsNoDevice() {
        gw.devices.clear()
        val start = clock.t
        val r = run()
        assertEquals(Outcome.NO_DEVICE, r.outcome)
        assertTrue("deve esperar a conexão do cabo", clock.t - start >= 5000)
        assertEquals(StepStatus.FAIL, r.step("usb_inventory").status)
        assertEquals(0, gw.openCalls)
        assertEquals(0, r.bytesWritten)
    }

    @Test fun deviceWithoutSerialDriver() {
        gw.devices = mutableListOf(UNKNOWN)
        val r = run()
        assertEquals(Outcome.DRIVER_UNSUPPORTED, r.outcome)
        assertEquals(0, gw.permissionRequests)
        assertTrue(r.conclusions.any { it.contains("1234:5678") })
    }

    @Test fun fallsBackToForcedCp21xxDriver() {
        gw.defaultDriver = null
        gw.openResults.add { session { _, _ -> EMGP_LINE } }
        val r = run()
        assertEquals(StepStatus.WARN, r.step("driver").status)
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
    }

    @Test fun permissionDenied() {
        gw.permissionResult = PermissionResult.DENIED
        val r = run()
        assertEquals(Outcome.PERMISSION_DENIED, r.outcome)
        assertEquals(0, gw.openCalls)
    }

    @Test fun permissionTimeout() {
        gw.permissionResult = PermissionResult.TIMEOUT
        assertEquals(Outcome.PERMISSION_TIMEOUT, run().outcome)
    }

    @Test fun alreadyGrantedPermissionIsNotRequestedAgain() {
        gw.permitted = true
        gw.openResults.add { session { _, _ -> EMGP_LINE } }
        run()
        assertEquals(0, gw.permissionRequests)
    }

    @Test fun openFailsAfterLimitedRetriesAndKeepsFallbackEvidence() {
        gw.permitted = true
        repeat(5) { gw.openResults.add(failOpen("openDevice retornou null")) }
        val start = clock.t
        val r = run()
        assertEquals(Outcome.OPEN_FAILED, r.outcome)
        assertEquals("limite de 3 tentativas", 3, gw.openCalls)
        assertEquals("backoff 500+1000ms", 1500L, clock.t - start)
        assertEquals("3", r.step("open").evidence["attempts"])
        assertEquals(StepStatus.OK, r.step("fallback").status)
        assertTrue(r.devices.isNotEmpty())
    }

    @Test fun openSucceedsOnSecondAttempt() {
        gw.permitted = true
        gw.openResults.add(failOpen())
        gw.openResults.add { session { _, _ -> EMGP_LINE } }
        val r = run()
        assertEquals(StepStatus.WARN, r.step("open").status)
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
    }

    @Test fun openThatHangsTimesOutInsteadOfFreezing() {
        gw.permitted = true
        gw.openResults.add { Thread.sleep(3000); session { _, _ -> null } }
        val r = run(DiagConfig(openAttempts = 1, openTimeoutMs = 150))
        assertEquals(Outcome.OPEN_FAILED, r.outcome)
        assertTrue(r.step("open").detail.contains("tempo esgotado"))
    }

    @Test fun textAt115200StopsWithoutScanning() {
        gw.permitted = true
        val s = session { _, _ -> BOOT_BANNER + EMGP_LINE }
        gw.openResults.add { s }
        val r = run()
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
        assertEquals(Confidence.ALTA, r.confidence)
        assertEquals(listOf(115200), s.configured)
        assertTrue(s.closed)
        assertTrue(r.analyses.single().signatures.any { it.contains("ROM") })
        assertTrue(r.analyses.single().signatures.any { it.contains("EMGP") })
    }

    @Test fun silentPortScansOnlyPassivelyAndReportsHonestly() {
        gw.permitted = true
        val s = session { _, _ -> null }
        gw.openResults.add { s }
        val r = run()
        assertEquals(Outcome.SERIAL_SILENT, r.outcome)
        assertEquals(listOf(115200) + DiagConfig().scanBauds + listOf(115200), s.configured)
        assertEquals(Confidence.MEDIA, r.confidence)
        assertTrue(r.conclusions.any { it.contains("NÃO prova") })
        assertEquals(0, r.bytesWritten)
        assertEquals(2 + DiagConfig().scanBauds.size, r.captures.size)
        assertTrue("pediu RESET físico", r.resetPrompted)
    }

    @Test fun garbledAt115200ButTextAt9600PicksTheWorkingBaud() {
        gw.permitted = true
        val s = session { baud, _ -> if (baud == 9600) EMGP_LINE else NOISE }
        gw.openResults.add { s }
        val r = run()
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
        assertTrue(r.conclusions.any { it.contains("NÃO é a padrão") })
        assertEquals(listOf(115200, 74880, 9600), s.configured)
    }

    @Test fun garbledEverywhere() {
        gw.permitted = true
        gw.openResults.add { session { _, _ -> NOISE } }
        assertEquals(Outcome.SERIAL_GARBLED, run().outcome)
    }

    @Test fun reconnectsAfterTransientDisconnect() {
        gw.permitted = true
        val first = session { _, c -> if (c == 2) ioFail() else null }
        val second = session { _, _ -> EMGP_LINE }
        gw.openResults.add { first }
        gw.openResults.add { second }
        val r = run()
        assertEquals(1, r.reconnects)
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
        assertTrue(first.closed)
        assertEquals(StepStatus.WARN, r.step("reconnect").status)
    }

    @Test fun disconnectWithDeviceGoneEndsWithDisconnected() {
        gw.permitted = true
        val s = session { _, c -> if (c == 1) { gw.devices.clear(); ioFail() } else null }
        gw.openResults.add { s }
        val r = run()
        assertEquals(Outcome.DISCONNECTED, r.outcome)
        assertEquals("limite de reconexões", 2, r.reconnects)
        assertTrue("captura parcial preservada", r.captures.isNotEmpty())
    }

    @Test fun cancelStopsSafelyAndClosesPort() {
        gw.permitted = true
        val s = session { _, _ -> null }
        val rn = runner(gw, clock)
        s.onRead = { if (s.configured.isNotEmpty()) rn.cancel() }
        gw.openResults.add { s }
        val r = rn.run()
        assertEquals(Outcome.CANCELLED, r.outcome)
        assertTrue(s.closed)
        assertEquals(1, s.configured.size)
    }

    @Test fun unexpectedExceptionBecomesInternalErrorNotCrash() {
        gw.listFailure = IllegalStateException("boom")
        val log = AppLog()
        val r = runner(gw, clock, log = log).run()
        assertEquals(Outcome.INTERNAL_ERROR, r.outcome)
        assertNotNull(r.conclusions.firstOrNull { it.contains("boom") })
        assertTrue(log.dump().contains("IllegalStateException"))
    }

    @Test fun captureIsBoundedBySize() {
        gw.permitted = true
        gw.openResults.add { session { _, call -> ByteArray(4000) { ((call + it) % 90 + 32).toByte() } } }
        val r = run(DiagConfig(maxCaptureBytes = 5000))
        val cap = r.captures.first()
        assertEquals(5000, cap.totalBytes)
        assertTrue(cap.truncated)
    }

    @Test fun neverEmitsStateOutOfOrder() {
        gw.permitted = true
        gw.openResults.add { session { _, _ -> EMGP_LINE } }
        val states = mutableListOf<DiagState>()
        DiagnosticRunner(gw, clock, AppLog(), DiagConfig(), object : DiagnosticRunner.Listener {
            override fun onState(state: DiagState) { states.add(state) }
            override fun onProgress(percent: Int) { assertTrue(percent in 0..100) }
            override fun onStep(step: Step) {}
        }).run()
        assertEquals(
            listOf(DiagState.DETECTING, DiagState.PERMISSION, DiagState.OPENING, DiagState.CONFIGURING, DiagState.READING, DiagState.FINISHED),
            states
        )
        assertFalse(states.contains(DiagState.SCANNING_BAUD))
    }

    // ---- caso real do ZIP v0.1.0: fluxo impossível, igual em todos os bauds
    @Test fun impossibleThroughputIsDetectedAtEveryBaudAndStopsFast() {
        gw.permitted = true
        val s = FakeSession(clock, costMs = 1) { _, _ -> PERIODIC_FLOOD }
        s.readback = { baud -> ChipReadback(0x02, baud.toLong(), 0x0800, 0) }
        gw.openResults.add { s }
        val start = clock.t
        val r = run()
        assertEquals(Outcome.SERIAL_RATE_ANOMALY, r.outcome)
        assertTrue(r.analyses.all { it.anomalous })
        assertEquals(33, r.analyses.first().period)
        assertEquals("CP2102", r.chip)
        assertTrue(r.conclusions.any { it.contains("33 bytes") })
        assertTrue(r.conclusions.any { it.contains("confirmou o baud") })
        assertEquals(0, r.bytesWritten)
        assertTrue("varredura redundante é interrompida", clock.t - start < 60_000)
        assertEquals("115200, 74880, 9600 e escuta pós-RESET", 4, s.configured.size)
        assertEquals(StepStatus.SKIPPED, r.step("scan_skip").status)
    }

    @Test fun readbackMismatchIsFlaggedAndExplained() {
        gw.permitted = true
        val s = FakeSession(clock, costMs = 1) { _, _ -> PERIODIC_FLOOD }
        s.readback = { _ -> ChipReadback(0x20, 3_000_000L, 0x0800, 0) }
        gw.openResults.add { s }
        val r = run()
        assertEquals(StepStatus.WARN, r.step("config").status)
        assertTrue(r.conclusions.any { it.contains("NÃO confirmou") })
        assertEquals("CP2102N", r.chip)
    }

    @Test fun moderateGarbageIsNotFlaggedAsImpossibleRate() {
        gw.permitted = true
        gw.openResults.add { session { _, _ -> NOISE } }
        val r = run()
        assertEquals(Outcome.SERIAL_GARBLED, r.outcome)
        assertTrue(r.analyses.none { it.anomalous })
    }

    @Test fun textStopsEarlyOnceEnoughBytesAreLegible() {
        gw.permitted = true
        val s = FakeSession(clock, costMs = 100) { _, _ -> EMGP_LINE.copyOf() }
        gw.openResults.add { s }
        val r = run()
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
        assertTrue("não precisa gastar os 8 s", r.captures.first().durationMs < 8000)
    }

    @Test fun bootBannerInsideNoiseAfterResetPromptProvesUartWorks() {
        gw.permitted = true
        lateinit var s: FakeSession
        s = FakeSession(clock, costMs = 1) { _, call ->
            if (s.configured.size >= 4 && call == 40) BOOT_BANNER else PERIODIC_FLOOD
        }
        gw.openResults.add { s }
        val r = run()
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
        assertTrue(r.resetPrompted)
        assertTrue(r.bannerAtMs >= 0)
        assertTrue(r.conclusions.any { it.contains("filtrou") })
        assertTrue(r.step("read_reset_115200").detail.contains("Texto legível"))
        assertEquals(0, r.bytesWritten)
    }

    @Test fun noBannerAfterResetPromptKeepsAnomalyAndSaysSo() {
        gw.permitted = true
        gw.openResults.add { FakeSession(clock, costMs = 1) { _, _ -> PERIODIC_FLOOD } }
        val states = mutableListOf<DiagState>()
        val r = DiagnosticRunner(gw, clock, AppLog(), DiagConfig(), object : DiagnosticRunner.Listener {
            override fun onState(state: DiagState) { states.add(state) }
            override fun onProgress(percent: Int) {}
            override fun onStep(step: Step) {}
        }).run()
        assertEquals(Outcome.SERIAL_RATE_ANOMALY, r.outcome)
        assertTrue(states.contains(DiagState.PROMPT_RESET))
        assertTrue(r.conclusions.any { it.contains("NENHUM banner") })
        assertEquals(-1L, r.bannerAtMs)
    }

    @Test fun constantNoisePacketsAreFilteredButStillCounted() {
        gw.permitted = true
        gw.openResults.add { FakeSession(clock, costMs = 1) { _, _ -> PERIODIC_FLOOD } }
        val r = run()
        val c = r.captures.first()
        assertEquals("ruído filtrado, nada de dado real", 0, c.totalBytes)
        assertTrue(c.dupChunks > 50)
        assertEquals(4096, c.junkPacketSize)
        assertTrue(c.receivedBytes > 100_000)
        assertTrue(c.readSizes.startsWith("4096B"))
        assertEquals(33, r.analyses.first().period)
    }

    @Test fun realisticEspAtBootLogIsRecoveredFromNoiseAndIdentified() {
        gw.permitted = true
        lateinit var s: FakeSession
        s = FakeSession(clock, costMs = 1) { _, call ->
            val i = call - 60
            if (s.configured.size >= 4 && i in AT_BOOT_PACKETS.indices) AT_BOOT_PACKETS[i] else PATTERN33
        }
        gw.openResults.add { s }
        val r = run()
        assertEquals(Outcome.SERIAL_DATA_OK, r.outcome)
        val recovered = String(r.captures.last().allBytes(), Charsets.ISO_8859_1)
        assertEquals("log limpo, sem ruído", AT_BOOT_LOG, recovered)
        val f = r.firmware!!
        assertTrue(f.espAt)
        assertEquals("4MB", f.flashSize)
        assertEquals("qa-test-v4.3.3-20220423", f.idfVersion)
        assertEquals("3", f.chipRevision)
        assertEquals("WROOM-32", f.moduleName)
        assertTrue(f.partitions.containsAll(listOf("phy_init", "otadata", "nvs", "at_customize", "ota_0", "ota_1")))
        assertTrue(r.conclusions.any { it.contains("Espressif AT") })
        assertTrue(r.nextSteps.any { it.contains("NUNCA grava firmware") })
        assertEquals(0, r.bytesWritten)
    }
}
