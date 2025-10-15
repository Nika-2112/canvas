/**
 * Универсальный способ достать строковый userId из next-auth session.
 * Поддерживает варианты: user.id, user._id, user.sub
 */
export function getSessionUserId(session: any): string {
  const u = session?.user ?? {};
  const possible = [u.id, u._id, u.sub];
  const first = possible.find(v => typeof v === "string" && v.trim().length > 0);
  return (first || "").toString();
}
