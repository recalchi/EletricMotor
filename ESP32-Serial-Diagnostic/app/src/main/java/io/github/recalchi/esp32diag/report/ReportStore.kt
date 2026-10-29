package io.github.recalchi.esp32diag.report

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import io.github.recalchi.esp32diag.DiagApp
import io.github.recalchi.esp32diag.core.DiagReport
import io.github.recalchi.esp32diag.core.WifiResult
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ReportStore {
    private const val MAX_KEPT = 10

    fun dir(ctx: Context): File = File(ctx.filesDir, "reports").apply { mkdirs() }

    fun deviceInfo(ctx: Context): DeviceInfo {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        @Suppress("DEPRECATION")
        val code = if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else pi.versionCode.toLong()
        return DeviceInfo(
            manufacturer = Build.MANUFACTURER, model = Build.MODEL,
            androidRelease = Build.VERSION.RELEASE, sdkInt = Build.VERSION.SDK_INT,
            abis = Build.SUPPORTED_ABIS.toList(),
            usbHostFeature = ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_USB_HOST),
            locale = Locale.getDefault().toLanguageTag(),
            appVersionName = pi.versionName ?: "?", appVersionCode = code
        )
    }

    /** Grava (ou regrava, se [file] for informado) o ZIP do relatório e devolve o arquivo. */
    fun save(ctx: Context, report: DiagReport, wifi: WifiResult?, file: File? = null): File {
        val target = file ?: File(
            dir(ctx),
            "esp32diag-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date(report.finishedAtMs)) + ".zip"
        )
        val files = ReportBuilder.files(report, deviceInfo(ctx), DiagApp.log.dump(), wifi)
        val bytes = ReportBuilder.zip(files, report.finishedAtMs)
        val tmp = File(target.parentFile, target.name + ".tmp")
        tmp.writeBytes(bytes)
        if (!tmp.renameTo(target)) {
            target.delete()
            check(tmp.renameTo(target)) { "não foi possível finalizar ${target.name}" }
        }
        rotate(ctx)
        return target
    }

    private fun rotate(ctx: Context) {
        dir(ctx).listFiles { f -> f.name.endsWith(".zip") }?.sortedByDescending { it.lastModified() }
            ?.drop(MAX_KEPT)?.forEach { it.delete() }
    }

    fun deleteAll(ctx: Context): Int {
        var n = 0
        dir(ctx).listFiles()?.forEach { if (it.delete()) n++ }
        return n
    }
}
