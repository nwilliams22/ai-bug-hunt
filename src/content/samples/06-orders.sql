SELECT u.id, u.email, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.created_at >= '2026-01-01'
GROUP BY u.id, u.email;
