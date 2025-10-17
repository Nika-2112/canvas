import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";

/**
 * Проставляет projectId всем потомкам страниц, у которых он уже есть.
 * Запускать ОДИН раз (или при миграции).
 */
async function run() {
  await connectDB();

  // 1) найдём все страницы, у которых есть projectId
  const roots = await Page.find({
    projectId: { $exists: true, $ne: null },
    archived: { $ne: true },
    deletedAt: null,
  })
    .select("_id projectId")
    .lean<{ _id: any; projectId: any }[]>();

  const queue: Array<{ id: string; projectId: string }> = roots.map((r) => ({
    id: String(r._id),
    projectId: String(r.projectId),
  }));

  // 2) BFS: для каждого узла проталкиваем projectId во всех детей, у кого он пустой
  while (queue.length) {
    const node = queue.shift()!;
    const children = await Page.find({
      parentId: node.id,
      archived: { $ne: true },
      deletedAt: null,
    })
      .select("_id projectId")
      .lean<{ _id: any; projectId?: any | null }[]>();

    const toUpdate = children.filter((c) => !c.projectId).map((c) => String(c._id));
    if (toUpdate.length) {
      await Page.updateMany(
        { _id: { $in: toUpdate } },
        { $set: { projectId: node.projectId } }
      );
    }

    // добавляем всех детей в очередь, чтобы идти дальше вниз
    for (const c of children) {
      queue.push({ id: String(c._id), projectId: node.projectId });
    }
  }

  console.log("Backfill completed");
}

run().then(() => process.exit(0));
