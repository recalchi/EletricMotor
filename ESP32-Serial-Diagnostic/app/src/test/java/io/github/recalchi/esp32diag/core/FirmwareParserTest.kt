package io.github.recalchi.esp32diag.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FirmwareParserTest {
    @Test fun parsesRealisticBootLog() {
        val f = FirmwareParser.parse(AT_BOOT_LOG)!!
        assertEquals("POWERON_RESET (0x1)", f.resetReason)
        assertEquals("SPI_FAST_FLASH_BOOT (0x13)", f.bootMode)
        assertEquals("40MHz", f.flashSpeed)
        assertEquals("DIO", f.flashMode)
        assertTrue(f.espAt)
        assertTrue(f.evidence.any { it.contains("at_customize") })
        assertTrue(f.lines().first().contains("4MB"))
    }

    @Test fun plainEspIdfBootWithoutAtMarkersIsNotFlaggedAsAt() {
        val log = "rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\nI (30) boot: ESP-IDF v5.1 2nd stage bootloader\r\n" +
            "I (68) boot:  0 nvs              WiFi data        01 02 00009000 00006000\r\n"
        val f = FirmwareParser.parse(log)!!
        assertFalse(f.espAt)
        assertEquals(listOf("nvs"), f.partitions)
    }

    @Test fun unrelatedTextIsNotAFirmwareLog() {
        assertNull(FirmwareParser.parse("{\"v\":1,\"dev\":\"x\"}\r\n"))
        assertNull(FirmwareParser.parse(""))
    }
}
