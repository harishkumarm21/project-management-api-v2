import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js"

// Find user
//       ↓
// Compare password
//       ↓
// Generate Access Token
//       ↓
// Generate Refresh Token
//       ↓
// Hash Refresh Token
//       ↓
// Store Session
//       ↓
// Return tokens
export class SessionRepository {
  async create(data: Prisma.SessionCreateInput) {
    return prisma.session.create({
      data
    })
  }

  async findByRefreshTokenHash(refreshTokenHash: string) {
    return prisma.session.findFirst({
      where: {
        refreshTokenHash, revokedAt: null, expiresAt: {
          gt: new Date()
        }
      }
    })
  }

  async revoke(id: string) {
    return prisma.session.update({
      where: { id }, data: {
        revokedAt: new Date()
      }
    })
  }
}

export const sessionRepository = new SessionRepository();