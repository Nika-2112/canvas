// /Project/canvas/app/api/calendar/route.ts
import { NextResponse } from "next/server";
import * as DB from "@/lib/mongodb";
import * as PageNS from "@/models/Page";

// Универсальный доступ к модели (default или именованные экспорты)
const PageModel: any = (PageNS as any).default ?? (PageNS as any).Page ?? PageNS;

function parseISO(input?: string | null) {
  if (!input) return undefined;
  const d = new Date(input);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request) {
  try {
    // Универсальный коннектор (connectToDB | connectDB | default | connect)
    const connect =
      (DB as any).connectToDB ||
      (DB as any).connectDB ||
      (DB as any).default ||
      (DB as any).connect;
    if (typeof connect === "function") {
      await connect();
    }

    const { searchParams } = new URL(req.url);
    const from = parseISO(searchParams.get("from"));
    const to = parseISO(searchParams.get("to"));
    const rootOnly = searchParams.get("rootOnly") === "1";

    // 1) Достаём из массива properties элемент типа "date"
    // 2) Превращаем строки "YYYY-MM-DD" в Date
    const pipeline: any[] = [
      // живые страницы
      {
        $match: {
          deletedAt: { $in: [null, undefined] },
          archivedAt: { $in: [null, undefined] },
        },
      },
      // вытащим первый объект со свойством type == "date"
      {
        $addFields: {
          dateProp: {
            $first: {
              $filter: {
                input: "$properties",
                as: "p",
                cond: { $eq: ["$$p.type", "date"] }, // важное место
              },
            },
          },
        },
      },
      // строки -> даты
      {
        $addFields: {
          dateStart: {
            $dateFromString: {
              dateString: "$dateProp.value.start",
              onNull: null,
              onError: null,
            },
          },
          dateEnd: {
            $dateFromString: {
              dateString: {
                $ifNull: ["$dateProp.value.end", "$dateProp.value.start"],
              },
              onNull: null,
              onError: null,
            },
          },
        },
      },
      // оставим только те, у кого дата действительно есть
      { $match: { dateStart: { $ne: null } } },
    ];

    // Фильтр по диапазону (пересечение интервалов):
    // (start <= to) && (end >= from)
    if (from && to) {
      pipeline.push({
        $match: { dateStart: { $lte: to }, dateEnd: { $gte: from } },
      });
    } else if (from) {
      pipeline.push({ $match: { dateEnd: { $gte: from } } });
    } else if (to) {
      pipeline.push({ $match: { dateStart: { $lte: to } } });
    }

    if (rootOnly) {
      pipeline.push({
        $match: { parentId: { $in: [null, undefined] } },
      });
    }

    // Формируем ответ
    pipeline.push(
      {
        $project: {
          _id: 1,
          title: 1,
          parentId: 1,
          date: {
            start: "$dateStart",
            end: "$dateEnd",
            allDay: true, // у тебя allDay не хранится — для календаря так ок
          },
          status: "$properties.status",
          tags: "$properties.tags",
        },
      },
      { $sort: { "date.start": 1, title: 1 } }
    );

    const docs = await (PageModel as any).aggregate(pipeline).exec();
    return NextResponse.json(Array.isArray(docs) ? docs : [], { status: 200 });
  } catch (e: any) {
    console.error("/api/calendar GET error", e);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: e?.message },
      { status: 500 }
    );
  }
}
