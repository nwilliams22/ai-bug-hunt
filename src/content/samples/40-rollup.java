package metering;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Rolls metered usage up into one row per customer per calendar day and
 * flushes the finished days to the warehouse every five minutes.
 *
 * Events arrive on the request threads. The flush runs on its own scheduler,
 * and {@code record} stands down while a flush is draining so that the two
 * never touch the map at the same time.
 */
public final class UsageRollup {

    private final Map<String, Long> pending = new HashMap<>();
    private final Warehouse warehouse;
    private final ScheduledExecutorService flusher =
            Executors.newSingleThreadScheduledExecutor();

    private boolean draining = false;
    private LocalDate today = LocalDate.now();

    public UsageRollup(Warehouse warehouse) {
        this.warehouse = warehouse;
        flusher.scheduleAtFixedRate(this::flush, 5, 5, TimeUnit.MINUTES);
    }

    /** Records {@code units} of usage for a customer at the time it happened. */
    public void record(String customerId, long units, LocalDateTime at) {
        if (draining) {
            return;
        }
        String key = customerId + ":" + at.toLocalDate();
        pending.merge(key, units, Long::sum);
    }

    /** Writes every day that is now complete and drops it from memory. */
    private void flush() {
        draining = true;

        LocalDate now = LocalDate.now();
        if (!now.equals(today)) {
            today = now;
        }

        Map<String, Long> batch = new HashMap<>();
        for (Map.Entry<String, Long> entry : pending.entrySet()) {
            LocalDate day = LocalDate.parse(entry.getKey().split(":")[1]);
            if (day.isBefore(today)) {
                batch.put(entry.getKey(), entry.getValue());
            }
        }

        warehouse.write(batch);
        for (String key : batch.keySet()) {
            pending.remove(key);
        }

        draining = false;
    }

    /** Hours of metered service in a billing period, for the invoice line. */
    public long billableHours(LocalDate from, LocalDate to) {
        ZoneId zone = ZoneId.systemDefault();
        Duration span = Duration.between(
                from.atStartOfDay(zone).toLocalDateTime(),
                to.atStartOfDay(zone).toLocalDateTime());
        return span.toHours();
    }
}
