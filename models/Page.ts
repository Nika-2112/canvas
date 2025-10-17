// ============================================
// 📄 models/Page.ts
// Модель Page — страница/документ пользователя.
// ============================================

import mongoose, { Schema, InferSchemaType, models } from "mongoose";

/** Подсхема PropertySchema (без изменений) */
const PropertySchema = new Schema(
  {
    id:    { type: String, required: true, trim: true },
    name:  { type: String, required: true, trim: true, default: "Без названия" },
    type:  { type: String, required: true, enum: ["text", "status", "date", "number", "tags"], default: "text" },
    value: { type: Schema.Types.Mixed, required: false },
  },
  { _id: false }
);

/** Подсхема Участник страницы (editor/guest) */
const PageMemberSchema = new Schema(
  {
    // ВАЖНО: БЕЗ index: true, иначе будет дублирование с общим индексом ниже
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role:   { type: String, enum: ["editor", "guest"], required: true },
  },
  { _id: false }
);

/** Основная схема Page */
const PageSchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: false, index: true },

    title:     { type: String, required: true, trim: true, default: "Новая страница" },
    content:   {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({ time: Date.now(), version: "2.31.0", blocks: [] }),
    },
    parentId:  { type: Schema.Types.ObjectId, ref: "Page", required: false, index: true },

    // статусы
    archived:  { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },

    // ИСПОЛНИТЕЛИ (у вас уже были)
    assignees: [{ type: Schema.Types.ObjectId, ref: "User" }],


    // УЧАСТНИКИ СТРАНИЦЫ (добавили сейчас)
    // в объект PageSchema (рядом с assignees)
    members: [{
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // index: true УДАЛЁН
      role:   { type: String, enum: ["editor", "guest"], required: true },
    }],




 


    // Свойства
    properties: { type: [PropertySchema], required: false, default: () => [] },
  },
  { timestamps: true }
);

// Индекс на участников, чтобы быстро искать
PageSchema.index({ "members.userId": 1 });


export type Page = InferSchemaType<typeof PageSchema>;
export const Page = models.Page || mongoose.model("Page", PageSchema);
