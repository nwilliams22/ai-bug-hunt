package com.example.report;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ReportBuilder {

    private static final SimpleDateFormat DAY = new SimpleDateFormat("yyyy-MM-dd");

    private final Map<AccountKey, Double> totals = new HashMap<>();

    public static class AccountKey {
        String region;
        String tier;

        AccountKey(String region, String tier) {
            this.region = region;
            this.tier = tier;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof AccountKey)) return false;
            AccountKey other = (AccountKey) o;
            return region == other.region && tier == other.tier;
        }

        @Override
        public int hashCode() {
            return region.hashCode() + tier.hashCode();
        }
    }

    public void add(String region, String tier, double amount) {
        AccountKey key = new AccountKey(region, tier);
        Double current = totals.get(key);
        totals.put(key, current == null ? amount : current + amount);
    }

    public String render(Date asOf, List<String> regions) {
        StringBuilder sb = new StringBuilder();
        sb.append("Report for ").append(DAY.format(asOf)).append("\n");
        for (String r : regions) {
            sb.append(r)
              .append(": ")
              .append(totals.get(new AccountKey(r, "standard")))
              .append("\n");
        }
        return sb.toString();
    }
}
