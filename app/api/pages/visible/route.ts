// app/api/pages/visible/route.ts
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { Page } from "@/models/Page";

export async function GET() {
  await connectDB();
  const session = await getSession();
  const me = (session?.user as any)?.id || null;
  if (!me) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  // личные (без участников)
  const personal = await Page.find({
    userId: me,
    deletedAt: null,
    archived: { $ne: true },
    $or: [{ members: { $exists: false } }, { members: { $size: 0 } }],
  })
    .select("_id title parentId userId members")
    .lean();

  // общие — 1) я владелец и есть участники
  const sharedOwned = await Page.find({
    userId: me,
    deletedAt: null,
    archived: { $ne: true },
    "members.0": { $exists: true },
  })
    .select("_id title parentId userId members")
    .lean();

  // общие — 2) я участник (даже если не владелец)
  const sharedMember = await Page.find({
    deletedAt: null,
    archived: { $ne: true },
    "members.userId": me,
  })
    .select("_id title parentId userId members")
    .lean();

  // пометим флагом
  const mapPersonal = personal.map((p: any) => ({ ...p, isShared: false }));
  const mapShared = [...sharedOwned, ...sharedMember].map((p: any) => ({ ...p, isShared: true }));

  return NextResponse.json({ personal: mapPersonal, shared: mapShared });
}
