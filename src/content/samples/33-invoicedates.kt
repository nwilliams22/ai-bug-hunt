package billing

import java.text.SimpleDateFormat
import java.util.Date

/**
 * Formats and compares the dates that appear on an invoice.
 *
 * The formatter is built once: SimpleDateFormat is expensive to construct and
 * the pattern never changes. Formatted dates are cached, because the statement
 * renderer asks for the same invoice several times per page.
 */
object InvoiceDates {
    private val ISO = SimpleDateFormat("yyyy-MM-dd")

    private val cache = mutableMapOf<Long, String>()

    /** The invoice date, as the customer's statement shows it. */
    fun format(at: Date): String = cache.getOrPut(at.time) { ISO.format(at) }

    /** True while the invoice is inside its 30 day payment window. */
    fun isCurrent(issued: Date, now: Date = Date()): Boolean {
        val days = (now.time - issued.time) / (1000 * 60 * 60 * 24)
        return days <= 30
    }

    /** The billing period the invoice falls in, as "YYYY-MM". */
    fun period(issued: Date): String = format(issued).substring(0, 7)
}
