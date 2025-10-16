import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// уже было
export async function getSession(): Promise<Session | null> {
  return await getServerSession(authOptions);
}

/** Удобные геттеры — опционально, если используешь */
export async function getUserId(): Promise<string | null> {
  const s = await getServerSession(authOptions);
  return (s?.user as any)?.id ?? null;
}
export async function getUserRole(): Promise<"admin" | "editor" | "guest" | null> {
  const s = await getServerSession(authOptions);
  return (s?.user as any)?.role ?? null;
}

/** ↓↓↓ ДОБАВЬ ЭТО ↓↓↓ */

// тип с «гарантированным» user
export type AssertedSession = Session & {
  user: Session["user"] & {
    id: string;
    username: string;
    role: "admin" | "editor" | "guest";
    isActive: boolean;
  };
};

export async function requireAuth(): Promise<AssertedSession> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session as AssertedSession;
}

export async function requireRole(role: "admin"): Promise<AssertedSession> {
  const session = await requireAuth();
  if (session.user.role !== role) throw new Error("FORBIDDEN");
  return session;
}
