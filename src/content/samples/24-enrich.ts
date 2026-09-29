interface Account {
  id: string;
  email: string;
}

interface Enriched extends Account {
  plan: string;
  seats: number;
}

/** Attaches plan details to every account, in email order. */
export async function enrichAccounts(
  accounts: Account[],
  fetchPlan: (id: string) => Promise<{ plan: string; seats: number }>,
): Promise<Enriched[]> {
  const out: Enriched[] = [];
  const failures: string[] = [];

  accounts.forEach(async (a) => {
    try {
      const detail = await fetchPlan(a.id);
      out.push({ ...a, ...detail });
    } catch {
      failures.push(a.id);
    }
  });

  if (failures.length > 0) {
    console.warn(`${failures.length} accounts failed to enrich`);
  }

  return out.sort((x, y) => (x.email > y.email ? 1 : -1));
}
