import { Response, Request, NextFunction } from "express";
import { AuthRepository } from "../modules/auth/auth.repository.js";
import { UnAuthorizedError } from "../errors/UnauthorizedError.js";
import { verifyAccessToken } from "../utils/jwt.js";

const authRepository = new AuthRepository();

// Client
//    │
// Authorization: Bearer eyJ...
//    │
//    ▼
// Auth Middleware
//    │
// Verify JWT
//    │
// Load User
//    │
// Attach User to Request
//    │
// next()
//    │
// Controller

export async function Authenticate(req: Request, _res: Response, next: NextFunction) {

  const authorization = req.headers.authorization;

  if (!authorization) {
    throw new UnAuthorizedError("Authorization header missing")
  }

  const [schema, token] = authorization.split(" ");

  console.log("==========", schema)

  if (schema !== "Bearer" || !token) {
    throw new UnAuthorizedError("Invalid authorization header")
  }

  const payload = verifyAccessToken(token)

  const user = await authRepository.findUserById(payload.sub)

  if (!user) {
    throw new UnAuthorizedError("User not found")
  }

  if (!user.isActive) {
    throw new UnAuthorizedError("User account is disabled")
  }

  req.user = user;

  next();

}