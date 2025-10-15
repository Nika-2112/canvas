/**
 * models/Page.ts
 * Модель Page — базовая сущность контента пользователя (аналог страницы Notion).
 *
 * Добавлено:
 *  - parentId: ссылка на родительскую страницу (null = корень). Обеспечивает иерархию.
 *  - tags: массив текстовых меток для упрощённой классификации (фильтры в UI).
 *
 * Обоснование (для диплома):
 *  - Иерархия страниц формирует структуру «проектов» как вложенных разделов.
 *  - Простые теги на уровне страницы позволяют группировать подстраницы (логистика, маркетинг и т.п.).
 */

import mongoose, { Schema, InferSchemaType, models } from "mongoose";

const PageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true },

    // content: допускаем как строку (исторически), так и Editor.js JSON (Mixed)
    content: { type: Schema.Types.Mixed, required: true },

    // Привязка к «книге/проекту» (если используется разделение по workspace)
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: false, index: true },

    // НОВОЕ: родительская страница (null => корневая страница)
    parentId: { type: Schema.Types.ObjectId, ref: "Page", required: false, default: null, index: true },

    // НОВОЕ: произвольные теги (используются в табличном виде подстраниц)
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Индексы для эффективных выборок «детей» и по тегам
PageSchema.index({ parentId: 1, createdAt: 1 });
PageSchema.index({ tags: 1 });

export type Page = InferSchemaType<typeof PageSchema>;
export const Page = models.Page || mongoose.model("Page", PageSchema);
