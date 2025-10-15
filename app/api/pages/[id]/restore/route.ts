import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] as any[] };
  }
  return raw;
}

async function collectDescendants(rootId: string, userId: string): Promise<string[]> {
  const q: string[] = [rootId];
  const out = new Set<string>();
  while (q.length) {
    const cur = q.shift()!;
    const kids = await Page.find({ parentId: cur, userId }).select("_id").lean();
    for (const k of kids) {
      const id = String((k as any)._id);
      if (!out.has(id)) {
        out.add(id);
        q.push(id);
      }
    }
  }
  return Array.from(out);
}

async function ensureChildLink(parentId: string, childId: string, userId: string) {
  const parent = await Page.findOne({ _id: parentId, userId });
  if (!parent) return;
  const content = normalizeEditorContent(parent.content);
  const exists = (content.blocks as any[]).some(
    (b: any) => b?.type === "child_page" && String(b?.data?.refId) === String(childId)
  );
  if (!exists) {
    (content.blocks as any[]).push({ type: "child_page", data: { refId: String(childId) } });
    parent.content = content;
    await parent.save();
  }
}

/** синхронизировать child_page ссылки: у каждого узла — на прямых детей */
async function syncBranchLinks(rootId: string, userId: string) {
  const all = [rootId, ...(await collectDescendants(rootId, userId))];
  for (const pid of all) {
    const children = await Page.find({
      parentId: pid,
      userId,
      archived: { $ne: true },
      deletedAt: null,
    })
      .select("_id")
      .lean();

    const childIds = children.map((c) => String((c as any)._id));
    if (childIds.length === 0) continue;

    const parent = await Page.findOne({ _id: pid, userId });
    if (!parent) continue;

    const content = normalizeEditorContent(parent.content);
    const have = new Set(
      (content.blocks as any[])
        .filter((b: any) => b?.type === "child_page")
        .map((b: any) => String(b?.data?.refId))
    );

    let changed = false;
    for (const cid of childIds) {
      if (!have.has(cid)) {
        (content.blocks as any[]).push({ type: "child_page", data: { refId: cid } });
        changed = true;
      }
    }
    if (changed) {
      parent.content = content;
      await parent.save();
    }
  }
}

/** дополнительно синхронизируем внешнего родителя после ensureChildLink */
async function syncParentLinksIfNeeded(parentId: string, userId: string) {
  // тот же алгоритм, что в syncBranchLinks, но только для одного parentId
  const children = await Page.find({
    parentId,
    userId,
    archived: { $ne: true },
    deletedAt: null,
  })
    .select("_id")
    .lean();

  const childIds = children.map((c) => String((c as any)._id));
  const parent = await Page.findOne({ _id: parentId, userId });
  if (!parent) return;

  const content = normalizeEditorContent(parent.content);
  const have = new Set(
    (content.blocks as any[])
      .filter((b: any) => b?.type === "child_page")
      .map((b: any) => String(b?.data?.refId))
  );

  let changed = false;
  for (const cid of childIds) {
    if (!have.has(cid)) {
      (content.blocks as any[]).push({ type: "child_page", data: { refId: cid } });
      changed = true;
    }
  }
  if (changed) {
    parent.content = content;
    await parent.save();
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const id = String(params.id);
  const page = await Page.findById(id);
  if (!page) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
  if (String(page.userId) !== String(userId)) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  // восстановим всю ветку из корзины
  const ids = [id, ...(await collectDescendants(id, userId))];
  await Page.updateMany({ _id: { $in: ids }, userId }, { $set: { deletedAt: null } });

  // восстановим ссылку у внешнего родителя и ДО-синхронизируем его
  if (page.parentId) {
    const pid = String(page.parentId);
    await ensureChildLink(pid, id, userId);
    await syncParentLinksIfNeeded(pid, userId); // 👈 доп. шаг — гарантирует правильный набор детей
  }

  // синхронизируем ссылки ВНУТРИ ветки
  await syncBranchLinks(id, userId);

  return NextResponse.json({ success: true, restored: ids.length });
}
