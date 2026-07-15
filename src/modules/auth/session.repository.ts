import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js"

export class SessionRepository {
  async create(data: Prisma.SessionCreateInput) {
    return prisma.session.create({
      data
    })
  }

  async findByRefreshTokenHash(refreshTokenHash: string) {
    return prisma.session.findFirst({
      where: {
        refreshTokenHash, revokedAt: null
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