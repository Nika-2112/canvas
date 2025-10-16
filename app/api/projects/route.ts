/**
 * API /api/projects
 *
 * Поддерживаемые методы:
 *  - GET    : вернуть проекты текущего пользователя; можно фильтровать по scope и archived.
 *  - POST   : создать проект (title, scope, archived?, isDefault?).
 *
 * Особенности:
 *  - При POST с isDefault=true — upsert «Разного»: будет ровно один такой проект на пользователя.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { Project } from "@/models/Project";

export async function GET(req: Request) {
  await connectDB();
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const userId = session.user.id; // 🔧 добавили переменную
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");      // 'personal' | 'shared' | null
  const archived = searchParams.get("archived"); // 'true' | 'false' | null

  const filter: any = { userId: userId };
  if (scope) filter.scope = scope;
  if (archived === "true") filter.archived = true;
  if (archived === "false") filter.archived = false;

  // 🔧 заменили me → userId
  const projects = await Project.find({
    $or: [
      { userId: userId },
      { "members.userId": userId } // участник тоже видит проект
    ]
  }).lean();

  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  await connectDB();
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const title = String(body?.title ?? "").trim();
    const scope = (body?.scope === "shared" ? "shared" : "personal") as "personal" | "shared";
    const archived = Boolean(body?.archived);
    const isDefault = Boolean(body?.isDefault);

    if (!title) {
      return NextResponse.json({ error: "Название проекта обязательно" }, { status: 400 });
    }

    // Если создают «Разное» — делаем upsert (один на пользователя).
    if (isDefault) {
      const upserted = await Project.findOneAndUpdate(
        { userId: session.user.id, isDefault: true },
        { $set: { title, scope, archived, isDefault: true } },
        { new: true, upsert: true }
      );
      return NextResponse.json(upserted, { status: 201 });
    }

    const created = await Project.create({
      userId: session.user.id,
      title,
      scope,
      archived,
      isDefault: false,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Ошибка при создании проекта" }, { status: 500 });
  }
}
