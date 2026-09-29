<?php

declare(strict_types=1);

/**
 * Cart pricing for the checkout page. All money is in whole cents.
 */
final class Pricing
{
    /** Sales tax by shipping state. */
    private const TAX = ['CA' => 0.0875, 'NY' => 0.08875, 'OR' => 0.0];

    /**
     * Total for a cart, in cents, with tax for the shipping state and an
     * optional percentage-off coupon.
     *
     * @param array<int, array{price: int, qty: int}> $items
     */
    public static function total(array $items, string $state, ?int $coupon = null): int
    {
        // The table is the same for every cart, so build it once.
        static $rates = null;
        if ($rates === null) {
            $rates = self::TAX;
            $rates[$state] = $rates[$state] ?? 0.0;
        }

        $subtotal = 0;
        foreach ($items as $item) {
            $subtotal += $item['price'] * $item['qty'];
        }

        if ($coupon) {
            $subtotal -= $subtotal * $coupon / 100;
        }

        return (int) ($subtotal * (1 + $rates[$state]));
    }
}
