data class Invoice(val accountId: String, val number: String, val amountCents: Long)
fun deduplicate(invoices: List<Invoice>): List<Invoice> {
    val seen = mutableSetOf<String>()
    return invoices.filter { seen.add(it.number.lowercase()) }
}
