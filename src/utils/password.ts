import bcrypt from "bcrypt";
import crypto from "node:crypto";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}