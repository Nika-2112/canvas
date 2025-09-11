/**
 * Модель страницы (Page).
 * Изменение: поле content хранится как "смешанный" тип (Mixed),
 * что позволяет сохранять объект JSON (например, структуру Editor.js).
 */

import mongoose, { Schema, model, models } from "mongoose";

const PageSchema = new Schema(
  {
    userId: { type: String, required: true },   // владелец страницы
    title: { type: String, required: true },    // заголовок
    // Mixed разрешает как строку, так и объект. Для Editor.js используем объект { time, blocks, version }.
    content: { type: Schema.Types.Mixed, default: { blocks: [] } },
  },
  { timestamps: true }
);

export const Page = models.Page || model("Page", PageSchema);
