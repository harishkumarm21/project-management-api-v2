import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtwPayLoad {
  sub: string
}

function signToken(payload: JwtwPayLoad, secret: string, expiresIn: SignOptions["expiresIn"]): string {
  return jwt.sign(payload, secret, {
    expiresIn
  })
}

// 15-minute access token
export function generateAccessToken(userId: string): string {
  return signToken({ sub: userId }, env.JWT_ACCESS_SECRET, "15m")
}

// 7-day refresh token
export function generateRefreshToken(userId: string): string {
  return signToken({ sub: userId }, env.JWT_REFRESH_SECRET, "7d")
}

// Verify access token
export function verifyAccessToken(token: string): JwtwPayLoad {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtwPayLoad;
}

// Verify refresh token
export function verifyRefreshToken(token: string): JwtwPayLoad {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtwPayLoad;
}