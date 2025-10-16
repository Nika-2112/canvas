// app/api/projects/[id]/members/route.ts
import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";
import { Project } from "@/models/Project";
import { User } from "@/models/User";


type ProjectMemberLean = { userId: Types.ObjectId; role: MemberRole };


type MemberRole = "editor" | "guest";

function okId(id?: string) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

type ProjectLean = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  members: Array<{ userId: Types.ObjectId; role: MemberRole }>;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const session = await getSession();
  const me = getSessionUserId(session);
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id проекта" }, { status: 400 });

  const pr = await Project.findById(id).select("userId members").lean<ProjectLean>();
  if (!pr) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });

  // видеть могут владелец и участники
  const amOwner = String(pr.userId) === String(me);
  const amMember = (pr.members || []).some(m => String(m.userId) === String(me));
  if (!amOwner && !amMember) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  const userIds = [String(pr.userId), ...(pr.members || []).map(m => String(m.userId))];
  const users = await User.find({ _id: { $in: userIds } }).select("_id username role isActive").lean();

  return NextResponse.json({
    ownerId: String(pr.userId),
    members: (pr.members || []).map(
        (m: { userId: Types.ObjectId; role: MemberRole }) => ({
          userId: String(m.userId),
          role: m.role,
        })
      ),
    users: users.map(u => ({ _id: String(u._id), username: u.username, role: u.role, isActive: u.isActive !== false })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const session = await getSession();
  const me = getSessionUserId(session);
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  if (!okId(id)) return NextResponse.json({ error: "Некорректный id проекта" }, { status: 400 });

  const { username, role } = await req.json().catch(() => ({}));
  if (!username || !["editor", "guest"].includes(role)) {
    return NextResponse.json({ error: "Укажите username и корректную роль (editor|guest)" }, { status: 400 });
  }

  const pr = await Project.findById(id);
  if (!pr) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });

  // управлять участниками может только владелец
  if (String(pr.userId) !== String(me)) {
    return NextResponse.json({ error: "Только владелец может управлять участниками" }, { status: 403 });
  }

  const user = await User.findOne({ username: String(username).trim() }).select("_id");
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 400 });

  const exists = (pr.members || []).some(
  (m: { userId: Types.ObjectId; role: MemberRole }) => String(m.userId) === String(user._id));
  if (exists) return NextResponse.json({ error: "Участник уже добавлен" }, { status: 400 });

  (pr.members as any) = [...(pr.members || []), { userId: user._id, role }];
  await pr.save();

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const session = await getSession();
  const me = getSessionUserId(session);
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const uid = url.searchParams.get("userId") || "";

  if (!okId(id) || !okId(uid)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const pr = await Project.findById(id);
  if (!pr) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });

  if (String(pr.userId) !== String(me)) {
    return NextResponse.json({ error: "Только владелец может управлять участниками" }, { status: 403 });
  }

  // нельзя удалить владельца
  if (String(pr.userId) === String(uid)) {
    return NextResponse.json({ error: "Нельзя удалить владельца проекта" }, { status: 400 });
  }

  pr.members = (pr.members || []).filter(
        (m: { userId: Types.ObjectId; role: MemberRole }) =>
          String(m.userId) !== String(uid)
      ) as any;

  await pr.save();

  return NextResponse.json({ success: true });
}
