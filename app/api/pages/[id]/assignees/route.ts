/**
 * API /api/pages/:id/assignees
 * - GET: видят владелец и любой участник (guest/editor)
 *   → возвращает [{ _id, username, role, isActive }]
 * - POST/DELETE: менять может владелец, admin и участник с role="editor"
 *   → assignees хранится как массив ObjectId (User._id)
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { User } from "@/models/User";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

type MemberLean = { userId: any; role?: "editor" | "guest" };
type PageLean = {
  _id: any;
  userId: any;
  members?: MemberLean[];
  archived?: boolean;
  deletedAt?: any;
  assignees?: any[];
};

function isHex24(v: string) {
  return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);
}

async function canView(userId: string, pageId: string) {
  const p = await Page.findById(pageId)
    .select("_id userId members archived deletedAt")
    .lean<PageLean | null>();

  if (!p || p.deletedAt || p.archived) return false;
  if (String(p.userId) === String(userId)) return true;
  if (Array.isArray(p.members) && p.members.some((m) => String(m.userId) === String(userId))) {
    return true;
  }
  return false;
}

async function canManage(session: any, pageId: string) {
  const uid = String(getSessionUserId(session) || "");
  const p = await Page.findById(pageId)
    .select("_id userId members archived deletedAt")
    .lean<PageLean | null>();

  if (!p || p.deletedAt || p.archived) return false;

  // владелец
  if (String(p.userId) === uid) return true;
  // админ
  if ((session?.user as any)?.role === "admin") return true;
  // редактор страницы
  if (Array.isArray(p.members) && p.members.some((m) => String(m.userId) === uid && m.role === "editor")) {
    return true;
  }
  return false;
}

/* ───────── GET ─────────
   params теперь Promise<{ id: string }> (Next.js сообщение об этом)
*/
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await ctx.params;

  if (!(await canView(String(userId), id))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  // забираем массив ObjectId исполнителей
  const page = await Page.findById(id)
    .select("assignees")
    .lean<PageLean | null>();

  const ids: string[] = Array.isArray(page?.assignees)
    ? page!.assignees.map((x: any) => String(x))
    : [];

  if (!ids.length) return NextResponse.json([]);

  // подтягиваем профили, как ждёт UI
  const users = await User.find({ _id: { $in: ids } })
    .select("_id username role isActive")
    .lean<{ _id: any; username: string; role: "admin" | "editor" | "guest"; isActive: boolean }[]>();

  // сортируем по исходному порядку ids (на всякий случай)
  const indexById = new Map(users.map((u) => [String(u._id), u]));
  const result = ids
    .map((id) => indexById.get(id))
    .filter(Boolean)
    .map((u) => ({
      _id: String(u!._id),
      username: u!.username,
      role: u!.role,
      isActive: !!u!.isActive,
    }));

  return NextResponse.json(result);
}

/* ───────── POST ───────── */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const myId = getSessionUserId(session);
  if (!myId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await ctx.params;

  if (!(await canManage(session, id))) {
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  }

  // допускаем тело вида { userId }, ["..."], "..."
  const payload = await req.json().catch(() => ({} as any));
  let targetId: any = payload?.userId ?? payload;
  if (Array.isArray(targetId)) targetId = targetId[0];
  if (targetId && typeof targetId === "object" && targetId.userId) targetId = targetId.userId;

  if (!isHex24(String(targetId))) {
    return NextResponse.json({ error: "Некорректный userId" }, { status: 400 });
  }

  await Page.updateOne(
    { _id: id, assignees: { $ne: targetId } }, // дедупликация
    { $push: { assignees: targetId } }
  );

  return NextResponse.json({ ok: true });
}

/* ───────── DELETE ───────── */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const myId = getSessionUserId(session);
  if (!myId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await ctx.params;

  if (!(await canManage(session, id))) {
    return NextResponse.json({ error: "Нет прав" }, { status: 403 });
  }

  const url = new URL(req.url);
  const targetId = url.searchParams.get("userId");

  if (!isHex24(String(targetId))) {
    return NextResponse.json({ error: "Некорректный userId" }, { status: 400 });
  }

  await Page.updateOne({ _id: id }, { $pull: { assignees: targetId } });
  return NextResponse.json({ ok: true });
}
