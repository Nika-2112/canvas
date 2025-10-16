// app/api/pages/[id]/members/route.ts
import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { User } from "@/models/User";
import { Page } from "@/models/Page";

/** роли приложения */
type AppRole = "admin" | "editor";

/** безопасная проверка ObjectId */
const okId = (id?: string) => !!id && mongoose.Types.ObjectId.isValid(id);

/** lean-тип страницы для TS */
type PageLean = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  members?: Array<{ userId: Types.ObjectId; role: "editor" | "guest" }>;
  parentId?: Types.ObjectId | null;
};

/** собрать все потомки страницы (по userId владельца) */
async function collectDescendants(rootId: string, ownerId: string): Promise<string[]> {
  const queue: string[] = [rootId];
  const out = new Set<string>();
  while (queue.length) {
    const cur = queue.shift() as string;
    const kids = await Page.find({ parentId: cur, userId: ownerId, deletedAt: null })
      .select("_id")
      .lean();
    for (const k of kids) {
      const id = String((k as any)._id);
      if (!out.has(id)) {
        out.add(id);
        queue.push(id);
      }
    }
  }
  return Array.from(out);
}

// GET: вернуть текущих участников страницы
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const myId = (session?.user as any)?.id || null;
  if (!myId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const page = await Page.findById(id).select("userId members").lean<PageLean>();
  if (!page) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  // видимость: владелец или участник
  const isOwner = String(page.userId) === String(myId);
  const amMember = (page.members || []).some((m) => String(m.userId) === String(myId));
  if (!isOwner && !amMember) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  const ids = (page.members || []).map((m) => String(m.userId));
  if (ids.length === 0) return NextResponse.json([]);

  const users = await User.find({ _id: { $in: ids } }).select("_id username role isActive").lean();
  return NextResponse.json(
    users.map((u) => ({
      _id: String(u._id),
      username: u.username,
      role: u.role as "editor" | "guest",
      isActive: u.isActive !== false,
    }))
  );
}

// POST: добавить участника и каскадом на всех потомков
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const myId = (session?.user as any)?.id || null;
  const myRole = ((session?.user as any)?.role ?? "editor") as AppRole;
  if (!myId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  if (myRole !== "admin" && myRole !== "editor") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { userId, username } = body || {};
  if (!userId && !username)
    return NextResponse.json({ error: "Укажите userId или username" }, { status: 400 });

  const pageDoc = await Page.findById(id);
  if (!pageDoc) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  // управлять участниками может владелец страницы или админ
  const isOwner = String(pageDoc.userId) === String(myId);
  if (!isOwner && myRole !== "admin") {
    return NextResponse.json({ error: "Только владелец или админ может менять участников" }, { status: 403 });
  }

  // находим пользователя
  const user =
    (userId && okId(userId) && (await User.findById(userId).select("_id role").lean())) ||
    (username && (await User.findOne({ username: username.trim() }).select("_id role").lean())) ||
    null;
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  // роль участника берём из роли пользователя (guest/editor) — без выбора в UI
  const memberRole = (user.role === "guest" ? "guest" : "editor") as "guest" | "editor";

  // 1) добавляем на текущую страницу
  (pageDoc as any).members = Array.isArray((pageDoc as any).members) ? (pageDoc as any).members : [];
  const list: Array<{ userId: Types.ObjectId; role: "editor" | "guest" }> = (pageDoc as any).members;
  const existsIndex = list.findIndex((m) => String(m.userId) === String(user._id));
  if (existsIndex >= 0) {
    list[existsIndex].role = memberRole;
  } else {
    list.push({ userId: user._id as any, role: memberRole });
  }
  await pageDoc.save();

  // 2) каскадом на всех потомков — добаляем, если отсутствует, с той же ролью
  const children = await collectDescendants(String(pageDoc._id), String(pageDoc.userId));
  if (children.length > 0) {
    const docs = await Page.find({ _id: { $in: children } });
    for (const d of docs) {
      (d as any).members = Array.isArray((d as any).members) ? (d as any).members : [];
      const arr: Array<{ userId: Types.ObjectId; role: "editor" | "guest" }> = (d as any).members;
      const i = arr.findIndex((m) => String(m.userId) === String(user._id));
      if (i >= 0) {
        arr[i].role = memberRole;
      } else {
        arr.push({ userId: user._id as any, role: memberRole });
      }
      await d.save();
    }
  }

  // уведомим UI (если слушаете это событие)
  try {
    // no-op на сервере; фронт может дергать /api/pages/visible
  } catch {}

  return NextResponse.json({ success: true });
}

// DELETE: убрать участника с этой страницы и всех её потомков
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const myId = (session?.user as any)?.id || null;
  const myRole = ((session?.user as any)?.role ?? "editor") as AppRole;
  if (!myId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const url = new URL(req.url);
  const uid = url.searchParams.get("userId") || "";
  if (!okId(uid)) return NextResponse.json({ error: "Некорректный userId" }, { status: 400 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const pageDoc = await Page.findById(id);
  if (!pageDoc) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  const isOwner = String(pageDoc.userId) === String(myId);
  if (!isOwner && myRole !== "admin") {
    return NextResponse.json({ error: "Только владелец или админ может менять участников" }, { status: 403 });
  }

  // удаляем на текущей
  (pageDoc as any).members = Array.isArray((pageDoc as any).members) ? (pageDoc as any).members : [];
  (pageDoc as any).members = (pageDoc as any).members.filter((m: { userId: Types.ObjectId }) => String(m.userId) !== String(uid));
  await pageDoc.save();

  // и на всех потомках
  const children = await collectDescendants(String(pageDoc._id), String(pageDoc.userId));
  if (children.length > 0) {
    const docs = await Page.find({ _id: { $in: children } });
    for (const d of docs) {
      (d as any).members = Array.isArray((d as any).members) ? (d as any).members : [];
      (d as any).members = (d as any).members.filter((m: { userId: Types.ObjectId }) => String(m.userId) !== String(uid));
      await d.save();
    }
  }

  return NextResponse.json({ success: true });
}
