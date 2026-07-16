import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { throwDeprecation } from "node:process";
import { UnAuthorizedError } from "../errors/UnauthorizedError.js";

export interface JwtPayLoad {
  sub: string
}

function signToken(payload: JwtPayLoad, secret: string, expiresIn: SignOptions["expiresIn"]): string {
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
export function verifyAccessToken(token: string): JwtPayLoad {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayLoad;
  } catch (error) {
    console.log("Error in verifyAccessToken", error)
    throw new UnAuthorizedError("Invalid access token")
  }
}

// Verify refresh token
export function verifyRefreshToken(token: string): JwtPayLoad {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayLoad;
  } catch (error) {
    console.log("Error in verifyRefreshToken", error)
    throw new UnAuthorizedError("Invalid refresh token")
  }
}