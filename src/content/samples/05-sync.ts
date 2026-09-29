async function syncUsers(users: User[]): Promise<void> {
  await Promise.all(users.map(u => db.upsert(u)));
  await cache.invalidate("users");
}
