// /Project/canvas/app/api/table/route.ts
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
    const connect =
      (DB as any).connectToDB ||
      (DB as any).connectDB ||
      (DB as any).default ||
      (DB as any).connect;
    if (typeof connect === "function") await connect();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();          // поиск по названию
    const statusFilter = searchParams.getAll("status");       // множественный ?status=doing&status=done
    const from = parseISO(searchParams.get("from"));          // фильтр по дате: пересечение
    const to   = parseISO(searchParams.get("to"));

    const pipeline: any[] = [
      // только «живые» страницы
      { $match: { deletedAt: { $in: [null, undefined] }, archivedAt: { $in: [null, undefined] } } },

      // быстрый текстовый фильтр по названию (если есть запрос)
      ...(q ? [{ $match: { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } }] : []),

      // вытащим первый date- и status-пропы
      { $addFields: {
          dateProp: {
            $first: {
              $filter: { input: "$properties", as: "p", cond: { $eq: ["$$p.type", "date"] } },
            },
          },
          statusProp: {
            $first: {
              $filter: { input: "$properties", as: "p", cond: { $eq: ["$$p.type", "status"] } },
            },
          },
        },
      },

      // строки -> даты
      { $addFields: {
          dateStart: { $dateFromString: { dateString: "$dateProp.value.start", onNull: null, onError: null } },
          dateEnd:   { $dateFromString: {
            dateString: { $ifNull: ["$dateProp.value.end", "$dateProp.value.start"] },
            onNull: null, onError: null
          } },
        },
      },

      // извлечём «сырой» статус (строка или объект)
      { $addFields: {
          statusRaw: {
            $let: {
              vars: { v: "$statusProp.value" },
              in: {
                $switch: {
                  branches: [
                    { case: { $eq: [{ $type: "$$v" }, "string"] }, then: "$$v" },
                    { case: { $eq: [{ $type: "$$v" }, "object"] }, then: { $ifNull: ["$$v.id", { $ifNull: ["$$v.value", null] }] } },
                  ],
                  default: null,
                },
              },
            },
          },
        },
      },
    ];

    // фильтр по датам (если задан отрезок): берём те, что пересекаются
    if (from && to) {
      pipeline.push({ $match: { $and: [{ dateStart: { $ne: null } }, { dateStart: { $lte: to } }, { dateEnd: { $gte: from } }] } });
    } else if (from) {
      pipeline.push({ $match: { $and: [{ dateStart: { $ne: null } }, { dateEnd: { $gte: from } }] } });
    } else if (to) {
      pipeline.push({ $match: { $and: [{ dateStart: { $ne: null } }, { dateStart: { $lte: to } }] } });
    }

    // отдаём минимально нужное для таблицы
    pipeline.push(
      { $project: {
          _id: 1,
          title: 1,
          parentId: 1,
          assignees: { $ifNull: ["$assignees", []] },
          date: { start: "$dateStart", end: "$dateEnd" },
          status: "$statusRaw",
        },
      },
      { $sort: { title: 1 } }
    );

    let docs = await (PageModel as any).aggregate(pipeline).exec();
    if (!Array.isArray(docs)) docs = [];

    // клиенту хочется фильтровать по нормализованному статусу — упростим тут
    const normalize = (raw: any) => {
      if (!raw) return null;
      let s = String(raw).trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
      const map: Record<string, string> = {
        "не начато": "todo", "в работе": "doing", "готово": "done",
        "not started": "todo", "to do": "todo", "todo": "todo",
        "in progress": "doing", "doing": "doing",
        "done": "done", "completed": "done",
        "blocked": "blocked", "on hold": "blocked",
        "без статуса": "unspecified", "none": "unspecified", "unspecified": "unspecified",
      };
      if (map[s]) return map[s];
      const compact = s.replace(/\s+/g, "");
      return map[compact] || compact;
    };

    // пост-фильтр по статусам (если передали ?status=...)
    const normalizedStatuses = statusFilter.map(normalize).filter(Boolean);
    if (normalizedStatuses.length) {
      docs = docs.filter((d: any) => normalizedStatuses.includes(normalize(d.status)));
    }

    return NextResponse.json(docs, { status: 200 });
  } catch (e: any) {
    console.error("/api/table GET error", e);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: e?.message }, { status: 500 });
  }
}
