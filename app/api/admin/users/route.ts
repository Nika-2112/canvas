import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireRole } from "@/lib/auth";

// Разрешённые роли для UI/создания
const ALLOWED_UI_ROLES = ["editor", "guest"] as const;
type UiRole = (typeof ALLOWED_UI_ROLES)[number];

export async function GET() {
  await connectDB();
  await requireRole("admin");

  // 🔒 Админа не отдаём в список
  const users = await User.find(
    { role: { $ne: "admin" } },
    "username email role isActive createdAt"
  )
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  await connectDB();
  await requireRole("admin");

  const body = await req.json().catch(() => ({}));
  const username: string = (body?.username ?? "").trim();
  const password: string = (body?.password ?? "").trim();
// НЕ пишем null в БД — если email пустой, вообще не передаём поле (undefined)
    let email: string | undefined =
      typeof body?.email === "string" && body.email.trim() !== "" ? body.email.trim() : undefined;


  const role: UiRole = ALLOWED_UI_ROLES.includes(body?.role) ? body.role : "editor";

  if (!username || !password) {
    return NextResponse.json({ error: "Укажите логин и пароль" }, { status: 400 });
  }

  // запрет дублей логина
  const exists = await User.findOne({ username });
  if (exists) {
    return NextResponse.json({ error: "Такой логин уже существует" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);


  console.log("DEBUG new user payload:", { username, email, role });

  // ⚠️ На сервере создаём ТОЛЬКО editor/guest (admin — никогда)
  const u = await User.create({
    username,
    passwordHash,
    role,
    email,
    isActive: true,
  });

  return NextResponse.json(
    { id: u._id, username: u.username, role: u.role, isActive: u.isActive },
    { status: 201 }
  );
}
