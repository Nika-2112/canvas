/**
 * Модель Page — страница/документ пользователя.
 * Доп. поле:
 *  - projectId: ссылка на Project (опционально), для привязки к «книге/проекту».
 */

import mongoose, { Schema, InferSchemaType, models } from "mongoose";

const PageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true },

    // content может быть строкой (старый формат) или Editor.js JSON (Mixed)
    content: { type: Schema.Types.Mixed, required: true },

    // привязка к проекту/книге (опционально)
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: false, index: true },
  },
  { timestamps: true }
);

export type Page = InferSchemaType<typeof PageSchema>;
export const Page = models.Page || mongoose.model("Page", PageSchema);
