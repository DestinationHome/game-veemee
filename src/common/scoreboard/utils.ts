export function getUtcDayBounds(offsetDays: number = 0) {
  const now = new Date();
  if (offsetDays !== 0) {
    now.setTime(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  }
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  ).getTime();
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  ).getTime();
  return { start, end };
}
