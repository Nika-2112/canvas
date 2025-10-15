/**
 * GET /api/pages/[id]/children
 * Возвращает прямых «детей» (подстраницы) для указанной страницы.
 *
 * Обоснование (для диплома):
 *  - Разделяем контент на уровни; быстрый доступ к подстраницам нужен для сайдбара
 *    и табличного представления (rows) внутри родителя.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> } // в Next 15 params — это Promise
) {
  await connectDB();
  const { id } = await context.params;

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
    }

  const children = await Page
    .find({ userId: session.user.id, parentId: id })
    .sort({ createdAt: 1 });

  return NextResponse.json(children);
}
