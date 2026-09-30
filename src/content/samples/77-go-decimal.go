package billing
import "strconv"
// Cents parses an amount supplied in major units by the payment gateway.
func Cents(amount string) (int64, error) {
    n, err := strconv.ParseFloat(amount, 64)
    if err != nil { return 0, err }
    return int64(n * 100), nil
}
