async function reserveSeat(eventId, seatId) {
  const seat = await db.seats.findOne({ eventId, seatId });
  if (seat.reserved) {
    throw new Error("Seat already reserved");
  }
  await db.seats.update({ eventId, seatId }, { reserved: true });
  return { ok: true };
}
