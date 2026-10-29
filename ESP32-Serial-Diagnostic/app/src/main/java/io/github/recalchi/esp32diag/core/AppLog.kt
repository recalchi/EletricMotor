package io.github.recalchi.esp32diag.core

import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/** Log estruturado em memória com rotação (anel). A saída é sempre redigida. */
class AppLog(private val maxLines: Int = 2000, private val nowMs: () -> Long = System::currentTimeMillis) {
    private val lines = ArrayDeque<String>()
    private var dropped = 0
    private val fmt = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    @Synchronized
    private fun add(level: String, tag: String, msg: String, t: Throwable?) {
        val sb = StringBuilder()
        sb.append(fmt.format(Date(nowMs()))).append(' ').append(level).append(' ').append(tag).append(": ").append(msg)
        if (t != null) {
            val sw = StringWriter()
            t.printStackTrace(PrintWriter(sw))
            sb.append('\n').append(sw.toString().trimEnd())
        }
        lines.addLast(sb.toString())
        while (lines.size > maxLines) {
            lines.removeFirst()
            dropped++
        }
    }

    fun i(tag: String, msg: String) = add("I", tag, msg, null)
    fun w(tag: String, msg: String, t: Throwable? = null) = add("W", tag, msg, t)
    fun e(tag: String, msg: String, t: Throwable? = null) = add("E", tag, msg, t)

    @Synchronized
    fun dump(): String {
        val body = lines.joinToString("\n")
        val head = if (dropped > 0) "[$dropped linhas antigas descartadas pela rotação]\n" else ""
        return Redactor.text(head + body) + "\n"
    }
}
