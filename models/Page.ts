/**
 * Модель Page — страница/документ пользователя.
 * Поля:
 *  - userId     : владелец
 *  - title      : заголовок
 *  - content    : Editor.js OutputData (Mixed)
 *  - parentId   : ссылка на родителя (для иерархии Notion-подобных страниц)
 *  - projectId  : (опц.) привязка к проекту/книге
 *  - archived   : признак архива (не показываем в обычном списке/дереве)
 *  - deletedAt  : дата мягкого удаления (попала в корзину). Через 7 дней можно удалять навсегда.
 */

import mongoose, { Schema, InferSchemaType, models } from "mongoose";

const PageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true, default: "Новая страница" },

    content: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({ time: Date.now(), version: "2.31.0", blocks: [] }),
    },


    // иерархия
    parentId: { type: Schema.Types.ObjectId, ref: "Page", required: false, index: true, default: null },

    // опциональная связь со «старым» Project (если используете)
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: false, index: true },

    // архив/корзина
    archived: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export type Page = InferSchemaType<typeof PageSchema>;
export const Page = models.Page || mongoose.model("Page", PageSchema);
