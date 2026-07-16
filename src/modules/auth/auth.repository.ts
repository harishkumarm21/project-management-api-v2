import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js"


export class AuthRepository {

  async findUserById(id: string) {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  }

  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } })
  }

  async createUser(data: Prisma.UserCreateInput) {
    return prisma.user.create({
      data,
    })
  }
}

export const authRepository = new AuthRepository();