export function monthRange(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function addMonths(d: Date, diff: number) {
  return new Date(d.getFullYear(), d.getMonth() + diff, Math.min(d.getDate(), 28));
}