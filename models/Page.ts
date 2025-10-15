// ============================================
// 📄 models/Page.ts
// Модель Page — страница/документ пользователя.
// Используется во всех API: /api/pages/[id], /api/pages/[id]/properties и т.д.
// ============================================

import mongoose, { Schema, InferSchemaType, models } from "mongoose";

/**
 * Подсхема PropertySchema
 * -----------------------
 * Описывает одно свойство страницы (аналог колонки в Notion).
 * Поддерживаемые типы:
 *  - text   : обычная строка (textarea)
 *  - status : одно значение из списка (Не начато / В работе / Готово)
 *  - date   : объект { start: string, end?: string | null } (диапазон)
 *
 * Совместимость:
 *  - старые типы "number" и "tags" продолжают работать (игнорируются в UI).
 */
const PropertySchema = new Schema(
  {
    /** стабильный идентификатор свойства (uuid/ts) */
    id: { type: String, required: true, trim: true },

    /** отображаемое имя свойства */
    name: { type: String, required: true, trim: true, default: "Без названия" },

    /** тип свойства (расширен) */
    type: {
      type: String,
      required: true,
      enum: ["text", "status", "date", "number", "tags"], // 🔧 добавлены новые типы
      default: "text",
    },

    /**
     * значение свойства:
     *  - text   → string
     *  - status → string
     *  - date   → { start: string, end?: string | null }
     *  - number → number
     *  - tags   → string[]
     */
    value: { type: Schema.Types.Mixed, required: false },
  },
  { _id: false }
);

/**
 * Основная схема Page
 * -------------------
 * Страница или подстраница пользователя.
 * Содержит контент Editor.js, иерархию, архив, корзину и свойства.
 */
const PageSchema = new Schema(
  {
    /** владелец страницы */
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /** заголовок страницы */
    title: { type: String, required: true, trim: true, default: "Новая страница" },

    /** контент (Editor.js OutputData или текст для обратной совместимости) */
    content: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({ time: Date.now(), version: "2.31.0", blocks: [] }),
    },

    /** ID родительской страницы (если это подстраница) */
    parentId: { type: Schema.Types.ObjectId, ref: "Page", required: false, index: true },

    /** логические статусы */
    archived: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },

    /** настраиваемые свойства (опционально) */
    properties: {
      type: [PropertySchema],
      required: false,
      default: () => [],
    },
  },
  { timestamps: true }
);

// Экспорт модели (с защитой от двойного объявления при hot-reload)
export type Page = InferSchemaType<typeof PageSchema>;
export const Page = models.Page || mongoose.model("Page", PageSchema);
