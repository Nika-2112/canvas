/**
 * Модель пользователя.
 * Хранит email (уникальный) и хэш пароля.
 * Обеспечиваем безопасность (хранение паролей только в зашифрованном виде).
 */
import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true } // createdAt, updatedAt автоматически
);

// Если модель уже создана (при hot reload) — используем её
export const User = models.User || model("User", UserSchema);
