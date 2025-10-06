/**
 * API-эндпоинт для коллекции страниц (Page).
 * Путь: /api/pages
 *
 * Поддерживаемые методы:
 *  - GET  : вернуть список страниц текущего пользователя (лёгкая проекция).
 *  - POST : создать новую страницу (title + content).
 *
 * Важно:
 *  - Здесь НЕТ динамических параметров маршрута, поэтому не используем `context.params`.
 *  - Для списка отдаём только лёгкие поля (_id, title, createdAt), чтобы не тянуть большой content.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";

/** GET /api/pages — список страниц пользователя (без content). */
export async function GET() {
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  // Лёгкая проекция: только нужные поля
  const pages = await Page.find(
    { userId: session.user.id },
    { title: 1, createdAt: 1 } // _id добавляется автоматически
  ).sort({ createdAt: -1 });

  return NextResponse.json(pages);
}

/** POST /api/pages — создание новой страницы. */
export async function POST(req: Request) {
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const rawTitle = (body?.title ?? "").toString();
    const title = rawTitle.trim() || "Без названия";

    // content может быть строкой или объектом Editor.js; Mixed в схеме это допускает.
    const content = typeof body?.content === "undefined" ? { blocks: [] } : body.content;

    const newPage = await Page.create({
      userId: session.user.id,
      title,
      content,
    });

    return NextResponse.json(newPage);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ошибка при создании страницы" },
      { status: 500 }
    );
  }
}
