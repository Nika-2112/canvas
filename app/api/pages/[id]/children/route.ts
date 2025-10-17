/**
 * API /api/pages/:id/children
 * - GET: если пользователь имеет доступ к РОДИТЕЛЮ (owner/member/по проекту предков),
 *         отдать ВСЕ «живые» дочерние страницы без доп. фильтров по пользователю.
 * - POST: создать подстраницу; наследуем участников и projectId от родителя.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { Project } from "@/models/Project";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

type MemberLean = { userId: any; role: "editor" | "guest" };
type ParentLean = {
  _id: any;
  userId: any;
  parentId?: any | null;
  members?: MemberLean[];
  projectId?: any | null;
  content: any;
};

function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] as any[] };
  }
  return raw;
}

/** Подняться вверх по предкам и вернуть ближайший projectId */
async function resolveInheritedProjectId(pageId: string): Promise<string | null> {
  let current: any = pageId;
  const seen = new Set<string>();
  while (current && !seen.has(String(current))) {
    seen.add(String(current));
    const p = await Page.findById(current)
      .select("_id parentId projectId")
      .lean<{ _id: any; parentId?: any | null; projectId?: any | null } | null>();
    if (!p) break;
    if (p.projectId) return String(p.projectId);
    current = p.parentId || null;
  }
  return null;
}

/* ───────── GET: дети ───────── */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await ctx.params;

  // 1) тянем родителя с участниками
  const parent = await Page.findById(id)
    .select("_id userId members projectId archived deletedAt")
    .lean<ParentLean | null>();

  if (!parent || (parent as any).archived || (parent as any).deletedAt) {
    return NextResponse.json({ error: "Родитель не найден" }, { status: 404 });
  }

  // 2) проверка доступа к РОДИТЕЛЮ: владелец / участник
  const canByParent =
    String(parent.userId) === String(userId) ||
    (Array.isArray(parent.members) &&
      parent.members.some((m) => String(m.userId) === String(userId)));

  // 3) проверка по ПРОЕКТУ у предков
  let canByProject = false;
  const inheritedProjectId =
    parent.projectId ? String(parent.projectId) : await resolveInheritedProjectId(id);

  if (inheritedProjectId) {
    const proj = await Project.findOne({
      _id: inheritedProjectId,
      $or: [{ userId }, { "members.userId": userId }],
    })
      .select("_id")
      .lean();
    canByProject = !!proj;
  }

  if (!canByParent && !canByProject) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  // 4) ЕСЛИ доступ к родителю есть — возвращаем ВСЕ «живые» дочерние без фильтра по юзеру
  const children = await Page.find({
    parentId: id,
    archived: { $ne: true },
    deletedAt: null,
  })
    .select("_id title parentId")
    .sort({ createdAt: 1 })
    .lean();

  const list = children.map((p: any) => ({
    _id: String(p._id),
    title: p.title || "",
    parentId: p.parentId ? String(p.parentId) : null,
  }));

  return NextResponse.json(list);
}

/* ───────── POST: создать подстраницу ───────── */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id: parentId } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const rawTitle = typeof body?.title === "string" ? body.title : "";
    const title = rawTitle.trim() || "Без названия";

    const parent = await Page.findOne({
      _id: parentId,
      archived: { $ne: true },
      deletedAt: null,
    })
      .select("_id userId members projectId content")
      .lean<ParentLean>();

    if (!parent) return NextResponse.json({ error: "Родитель не найден" }, { status: 404 });

    const amOwner = String(parent.userId) === String(userId);
    const amMember = Array.isArray(parent.members)
      ? parent.members.some((m) => String(m.userId) === String(userId))
      : false;
    const isAdmin = (session?.user as any)?.role === "admin";

    if (!amOwner && !amMember && !isAdmin) {
      return NextResponse.json({ error: "Нет прав для создания подстраницы" }, { status: 403 });
    }

    const inheritedMembers =
      Array.isArray(parent.members) && parent.members.length
        ? parent.members.map((m) => ({
            userId: m.userId, // ВАЖНО: ObjectId, не String()
            role: m.role === "guest" ? "guest" : "editor",
          }))
        : [];

    const child = await Page.create({
      userId,
      title,
      content: { time: Date.now(), version: "2.31.0", blocks: [] as any[] },
      parentId,
      projectId: parent.projectId ? parent.projectId : null, // ObjectId
      members: inheritedMembers,
      archived: false,
      deletedAt: null,
    });

    // вставим ссылку child_page в контент родителя
    const parentDoc = await Page.findById(parentId);
    if (parentDoc) {
      const normalized = normalizeEditorContent(parentDoc.content);
      normalized.blocks.push({
        type: "child_page",
        data: { refId: String(child._id) },
      });
      parentDoc.content = normalized;
      await parentDoc.save();
    }

    const plain = (child as any).toObject ? (child as any).toObject() : child;
    plain._id = String(plain._id);
    return NextResponse.json(plain, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ошибка" }, { status: 500 });
  }
}
