/**
 * GET /api/search?q=<term>
 * Поиск по ВСЕМ страницам текущего пользователя (включая вложенные).
 *
 * Ищем:
 *  - по заголовку (регистронезависимая регулярка),
 *  - по простому тексту блоков Editor.js (paragraph/header/list).
 *
 * Возвращаем:
 *  - _id, title, parentId, updatedAt, snippet (короткая строка для превью).
 *
 * Примечание:
 *  - Для продакшена оптимально завести полнотекстовый индекс. Здесь — лёгкая реализация.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";
import { Page } from "@/models/Page";

function safeRegex(q: string) {
  try {
    return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  } catch {
    return /./i;
  }
}

// упрощённый извлекатель текста из Editor.js
function extractPlainText(content: any): string {
  if (!content || typeof content !== "object" || !Array.isArray(content.blocks)) return "";
  const parts: string[] = [];
  for (const b of content.blocks) {
    if (b?.type === "paragraph" && b?.data?.text) parts.push(String(b.data.text));
    if (b?.type === "header" && b?.data?.text) parts.push(String(b.data.text));
    if (b?.type === "list" && Array.isArray(b?.data?.items)) parts.push(b.data.items.join(" "));
    // блоки child_page пропускаем: они кликабельные и сами по себе не содержат текста
  }
  return parts.join(" ").slice(0, 2000);
}

export async function GET(req: Request) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const rx = safeRegex(q);

  // 1) быстрый поиск по title
  const byTitle = await Page.find(
    { userId, title: rx },
    { _id: 1, title: 1, parentId: 1, updatedAt: 1, content: 1 }
  )
    .sort({ updatedAt: -1 })
    .limit(25)
    .lean();

  // 2) если мало — добираем по содержимому блоков
  let results = byTitle;
  if (results.length < 25) {
    const more = await Page.find(
      { userId, title: { $not: rx } },
      { _id: 1, title: 1, parentId: 1, updatedAt: 1, content: 1 }
    )
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const filtered = more.filter((p) => rx.test(extractPlainText(p.content)));
    results = [...results, ...filtered].slice(0, 25);
  }

  const payload = results.map((p) => ({
    _id: String(p._id),
    title: p.title || "Без названия",
    parentId: p.parentId ? String(p.parentId) : null,
    updatedAt: p.updatedAt,
    snippet: `${p.title || ""} — ${extractPlainText(p.content)}`.slice(0, 160),
  }));

  return NextResponse.json({ results: payload });
}
