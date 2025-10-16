// app/api/pages/[id]/assignees/route.ts
import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { User } from "@/models/User";
import { Page } from "@/models/Page";

type AppRole = "admin" | "editor";
const okId = (id?: string) => !!id && mongoose.Types.ObjectId.isValid(id);

type PageLean = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  assignees?: Types.ObjectId[];
  members?: Array<{ userId: Types.ObjectId; role: "editor" | "guest" }>;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const me = (session?.user as any)?.id || null;
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const page = await Page.findById(id).select("userId assignees members").lean<PageLean>();
  if (!page) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  const isOwner = String(page.userId) === String(me);
  const amMember = (page.members || []).some((m) => String(m.userId) === String(me));
  if (!isOwner && !amMember) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  const ids = (page.assignees || []).map(String);
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

// Добавить исполнителя (только editor/admin И если user — участник страницы)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const me = (session?.user as any)?.id || null;
  const myRole = ((session?.user as any)?.role ?? "editor") as AppRole;
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
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

  const isOwner = String(pageDoc.userId) === String(me);
  if (!isOwner && myRole !== "admin") {
    return NextResponse.json({ error: "Только владелец или админ может менять исполнителей" }, { status: 403 });
  }

  // найдём пользователя
  const user =
    (userId && okId(userId) && (await User.findById(userId).select("_id").lean())) ||
    (username && (await User.findOne({ username: username.trim() }).select("_id").lean())) ||
    null;
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  // проверяем, что он является участником страницы
  const members = Array.isArray((pageDoc as any).members) ? (pageDoc as any).members : [];
  const isMember = members.some((m: { userId: Types.ObjectId }) => String(m.userId) === String(user._id));
  if (!isMember) {
    return NextResponse.json({ error: "Назначить исполнителем можно только участника страницы" }, { status: 400 });
  }

  (pageDoc as any).assignees = Array.isArray((pageDoc as any).assignees)
    ? (pageDoc as any).assignees
    : [];
  const exists = (pageDoc as any).assignees.some((x: any) => String(x) === String(user._id));
  if (!exists) (pageDoc as any).assignees.push(user._id as any);

  await pageDoc.save();
  return NextResponse.json({ success: true });
}

// Удалить исполнителя
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const me = (session?.user as any)?.id || null;
  const myRole = ((session?.user as any)?.role ?? "editor") as AppRole;
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const url = new URL(req.url);
  const uid = url.searchParams.get("userId") || "";
  if (!okId(uid)) return NextResponse.json({ error: "Некорректный userId" }, { status: 400 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const pageDoc = await Page.findById(id);
  if (!pageDoc) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  const isOwner = String(pageDoc.userId) === String(me);
  if (!isOwner && myRole !== "admin") {
    return NextResponse.json({ error: "Только владелец или админ может менять исполнителей" }, { status: 403 });
  }

  (pageDoc as any).assignees = Array.isArray((pageDoc as any).assignees)
    ? (pageDoc as any).assignees
    : [];
  (pageDoc as any).assignees = (pageDoc as any).assignees.filter((x: any) => String(x) !== String(uid));
  await pageDoc.save();

  return NextResponse.json({ success: true });
}
