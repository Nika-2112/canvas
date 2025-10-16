// app/api/pages/[id]/assignees/route.ts
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { User } from "@/models/User";
import { Page } from "@/models/Page";

const okId = (id?: string) => !!id && mongoose.Types.ObjectId.isValid(id);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const me = (session?.user as any)?.id || null;
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const page = await Page.findById(id)
    .select("userId members assignees")
    .lean<{ userId: string; members?: Array<{ userId: string }>; assignees?: string[] }>();
  if (!page) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  // Проверка доступа: владелец или участник
  const isOwner = String(page.userId) === String(me);
  const isMember = (page.members || []).some((m) => String(m.userId) === String(me));
  if (!isOwner && !isMember) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const ids = (page.assignees || []).map(String);
  if (ids.length === 0) return NextResponse.json([]);

  const users = await User.find({ _id: { $in: ids } })
    .select("_id username role isActive")
    .lean();

  return NextResponse.json(
    users.map((u) => ({
      _id: String((u as any)._id),
      username: (u as any).username,
      role: (u as any).role,
      isActive: (u as any).isActive !== false,
    }))
  );
}

// ➕ Добавить исполнителя
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const me = (session?.user as any)?.id || null;
  const myRole = (session?.user as any)?.role || "guest";
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { userId } = body || {};
  if (!userId) return NextResponse.json({ error: "Не указан userId" }, { status: 400 });

  const page = await Page.findById(id);
  if (!page) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  // Только владелец или редактор может назначать исполнителей
  const isOwner = String(page.userId) === String(me);
  if (!isOwner && myRole !== "editor" && myRole !== "admin") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  // Если у страницы нет участников — запрещаем
  if (!page.members || page.members.length === 0) {
    return NextResponse.json({ error: "Нет участников — нельзя назначать исполнителей" }, { status: 400 });
  }

  // Проверяем, что назначаемый пользователь — участник
  const isMember = page.members.some((m: any) => String(m.userId) === String(userId));
  if (!isMember) {
    return NextResponse.json({ error: "Назначать можно только участника страницы" }, { status: 400 });
  }

  const user = await User.findById(userId).select("_id username").lean();
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  page.assignees = Array.isArray(page.assignees) ? page.assignees : [];
  const exists = page.assignees.some((x: any) => String(x) === String((user as any)._id));
  if (!exists) page.assignees.push((user as any)._id);

  await page.save();
  return NextResponse.json({ success: true });
}

// ❌ Удалить исполнителя
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const me = (session?.user as any)?.id || null;
  const myRole = (session?.user as any)?.role || "guest";
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const uid = url.searchParams.get("userId") || "";
  if (!okId(id) || !okId(uid)) return NextResponse.json({ error: "Некорректные id" }, { status: 400 });

  const page = await Page.findById(id);
  if (!page) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });

  const isOwner = String(page.userId) === String(me);
  if (!isOwner && myRole !== "admin" && myRole !== "editor") {
    return NextResponse.json({ error: "Нет прав для снятия исполнителя" }, { status: 403 });
  }

  page.assignees = (page.assignees || []).filter((x: any) => String(x) !== String(uid));
  await page.save();
  return NextResponse.json({ success: true });
}
