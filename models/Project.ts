/**
 * Модель Project — проект/«книга» в сайдбаре.
 *
 * Назначение:
 *  - Хранит пользовательские проекты двух типов: personal (личные) и shared (общие).
 *  - Поле archived используется для замороженных/завершённых проектов.
 *  - Поле isDefault помечает «Разное» (быстрые заметки) — по одному на пользователя.
 */

import mongoose, { Schema, InferSchemaType, models } from "mongoose";

const ProjectSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true },

    // personal — личный проект; shared — совместный проект (с участниками)
    scope: {
      type: String,
      enum: ["personal", "shared"],
      default: "personal",
      required: true,
      index: true,
    },

    // Для shared-проектов — список участников (на будущее)
    members: [{ type: String }],

    // Архивация/«заморозка»
    archived: { type: Boolean, default: false },

    // «Разное» (быстрые заметки). Для каждого userId допускается только один такой проект.
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Уникальность «Разного» на пользователя
ProjectSchema.index({ userId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export type Project = InferSchemaType<typeof ProjectSchema>;
export const Project = models.Project || mongoose.model("Project", ProjectSchema);
