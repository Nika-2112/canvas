import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireRole } from "@/lib/auth";

const ALLOWED_UI_ROLES = ["editor", "guest"] as const;
type UiRole = (typeof ALLOWED_UI_ROLES)[number];
type RoleDoc = { _id: any; role: "admin" | "editor" | "guest" };


export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await requireRole("admin");
  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: any = {};

  if (typeof body.username === "string" && body.username.trim()) {
    updates.username = body.username.trim();
  }

  // 🔒 Разрешаем менять роль только на editor/guest
  if (typeof body.role === "string") {
    if (ALLOWED_UI_ROLES.includes(body.role)) {
      updates.role = body.role as UiRole;
    } else if (body.role === "admin") {
      return NextResponse.json({ error: "Назначение роли admin запрещено из UI" }, { status: 400 });
    } else {
      return NextResponse.json({ error: "Неверная роль" }, { status: 400 });
    }
  }

  if (typeof body.isActive === "boolean") {
    updates.isActive = body.isActive;
  }

  if (typeof body.password === "string" && body.password.trim()) {
    updates.passwordHash = await bcrypt.hash(body.password.trim(), 10);
  }

  // защита от само-урона (хоть админ и скрыт в UI, оставим безопасник)
  if (String(session.user.id) === String(id)) {
    if (updates.role) {
      return NextResponse.json({ error: "Нельзя менять себе роль из UI" }, { status: 400 });
    }
    if (updates.isActive === false) {
      return NextResponse.json({ error: "Нельзя деактивировать самого себя" }, { status: 400 });
    }
  }

  // Доп. защита: не трогать настоящего админа вообще
  const target = await User.findById(id).select("role").lean<RoleDoc | null>();
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "Изменение администратора запрещено" }, { status: 400 });
  }

  const updated = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
    .select("username email role isActive")
    .lean();

  if (!updated) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const session = await requireRole("admin");
  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  if (String(session.user.id) === String(id)) {
    return NextResponse.json({ error: "Нельзя удалить самого себя" }, { status: 400 });
  }

  // Не удаляем администратора
        const target = await User.findById(id).select("role").lean<RoleDoc | null>();

        if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
        if (target.role === "admin") {
        return NextResponse.json({ error: "Удаление администратора запрещено" }, { status: 400 });
}

  await User.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
