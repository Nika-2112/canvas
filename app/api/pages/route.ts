/**
 * API-эндпоинт для работы со страницами (Page).
 * - GET: список страниц текущего пользователя.
 * - POST: создание новой страницы.
 * Примечание: поле content допускает как текст, так и объект (Editor.js).
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";

export async function GET() {
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const pages = await Page.find({ userId: session.user.id }).sort({ createdAt: -1 });
  return NextResponse.json(pages);
}

export async function POST(req: Request) {
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const rawTitle = (body?.title ?? "").toString();
    const title = rawTitle.trim();

    if (!title) {
      return NextResponse.json({ error: "Заголовок обязателен" }, { status: 400 });
    }

    // content может быть строкой или объектом; Mixed это допускает.
    const content = body?.content ?? { blocks: [] };

    const newPage = await Page.create({
      userId: session.user.id,
      title,
      content,
    });

    return NextResponse.json(newPage);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Ошибка при создании страницы" }, { status: 500 });
  }
}
