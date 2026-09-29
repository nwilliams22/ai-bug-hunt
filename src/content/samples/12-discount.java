class Discount {
    /** Apply a percentage discount and round to the nearest cent. */
    public static double applyDiscount(double price, double percent) {
        double discount = price * percent / 100;
        return Math.round((price - discount) * 100) / 100;
    }
}
