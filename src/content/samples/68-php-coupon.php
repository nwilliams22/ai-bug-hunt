<?php
function finalCents(int $subtotal, array $coupon): int {
    $minimum = $coupon['minimum_cents'] ?? 0;
    if ($subtotal < $minimum) return $subtotal;
    $percent = (int) ($coupon['percent'] ?? 0);
    return $subtotal - intdiv($subtotal * $percent, 100);
}
