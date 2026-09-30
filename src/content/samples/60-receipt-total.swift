import Foundation
struct Line { let unitCents: Int; let quantity: Int }
/// Return the payable amount in cents after a percentage discount.
func payable(_ lines: [Line], discountPercent: Int) -> Int {
    let subtotal = lines.reduce(0) { $0 + $1.unitCents * $1.quantity }
    let discount = subtotal * discountPercent / 100
    return subtotal - discount
}
