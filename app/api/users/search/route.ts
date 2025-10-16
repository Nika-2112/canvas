// app/api/users/search/route.ts
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  await connectDB();
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json([]);

  // поиск по username (префикс) + ограничим до 10
  const list = await User.find({
    username: { $regex: `^${q}`, $options: "i" },
    isActive: { $ne: false },
  })
    .select("_id username email role")
    .limit(10)
    .lean<{ _id: any; username: string; email?: string | null; role: "admin" | "editor" | "guest" }[]>();

  // вернём поля в плоском формате
  const data = list.map((u) => ({
    id: String(u._id),
    username: u.username,
    email: u.email || null,
    role: u.role,
  }));

  return NextResponse.json(data);
}
