/**
 * Модель Project — проект/«книга» в сайдбаре.
 *
 * Назначение:
 *  - Хранит пользовательские проекты двух типов: personal (личные) и shared (общие).
 *  - Поле archived используется для замороженных/завершённых проектов.
 *  - Поле isDefault помечает «Разное» (быстрые заметки) — по одному на пользователя.
 *  - Поле members — участники shared-проекта с ролями "editor" | "guest".
 */

import mongoose, { Schema, InferSchemaType, models } from "mongoose";

/** Участник проекта (только для scope === "shared") */
const ProjectMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role:   { type: String, enum: ["editor", "guest"], required: true },
  },
  { _id: false }
);

const ProjectSchema = new Schema(
  {
    /** Владелец проекта (создатель) */
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /** Заголовок проекта */
    title: { type: String, required: true, trim: true },

    /** personal — личный; shared — общий (с участниками) */
    scope: {
      type: String,
      enum: ["personal", "shared"],
      default: "personal",
      required: true,
      index: true,
    },

    /** Участники общего проекта (для personal обычно пусто) */
    members: { type: [ProjectMemberSchema], default: [] },

    /** Корневая страница проекта (если ты это используешь в навигации) */
    rootPageId: { type: Schema.Types.ObjectId, ref: "Page", default: null },

    /** Архивация/«заморозка» */
    archived: { type: Boolean, default: false, index: true },

    /** «Разное» (быстрые заметки). Для каждого userId допускается только один такой проект. */
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** Уникальность «Разного» на пользователя */
ProjectSchema.index(
  { userId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

/** Индекс на участников, чтобы быстрее искать «где состоит пользователь» */
ProjectSchema.index({ "members.userId": 1 });

export type ProjectDoc = InferSchemaType<typeof ProjectSchema>;
export const Project = models.Project || mongoose.model("Project", ProjectSchema);
