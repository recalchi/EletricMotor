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
        assertEquals(listOf(115200) + DiagConfig().scanBauds, s.configured)
        assertEquals(Confidence.MEDIA, r.confidence)
        assertTrue(r.conclusions.any { it.contains("NÃO prova") })
        assertEquals(0, r.bytesWritten)
        assertEquals(1 + DiagConfig().scanBauds.size, r.captures.size)
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
        val big = ByteArray(4000) { 'A'.code.toByte() }
        gw.openResults.add { session { _, _ -> big } }
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
        assertTrue("cada captura encerra cedo", clock.t - start < 20_000)
        assertEquals(1 + DiagConfig().scanBauds.size, s.configured.size)
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
}
