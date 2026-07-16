import { ConflictError } from "../../errors/ConflictError.js";
import { AuthRepository } from "./auth.repository.js";
import bcrypt from "bcrypt";
import { LoginInput, RefreshInput, RegisterInput } from "./auth.validation.js";
import { UnAuthorizedError } from "../../errors/UnauthorizedError.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";
import { hashRefreshToken } from "../../utils/password.js";
import { SessionRepository } from "./session.repository.js";

export class AuthService {
  constructor(private readonly authRepository: AuthRepository, private readonly sessionRepository: SessionRepository) { }


  async register(input: RegisterInput) {

    const existingUser = await this.authRepository.findUserByEmail(input.email);

    if (existingUser) {
      throw new ConflictError("Email is already Registered")
    }

    const passwardHash = await bcrypt.hash(input.password, 12);

    const user = await this.authRepository.createUser({
      email: input.email, passwordHash: passwardHash, displayName: input.displayName
    })



    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt
    }
  }

  async login(input: LoginInput) {

    const user = await this.authRepository.findUserByEmail(input.email);

    if (!user) throw new UnAuthorizedError("Invalid email or password");

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isPasswordValid) throw new UnAuthorizedError("Invalid email or password");

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken(user.id)

    const refreshTokenHash = hashRefreshToken(refreshToken);

    await this.sessionRepository.create({
      user: {
        connect: {
          id: user.id
        }
      },
      refreshTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      },
      accessToken, refreshToken
    }
  }

  async refresh(input: RefreshInput) {

    const payload = verifyRefreshToken(input.refreshToken)

    const refreshTokenHash = hashRefreshToken(input.refreshToken)

    const session = this.sessionRepository.findByRefreshTokenHash(refreshTokenHash);

    if (!session) {
      throw new UnAuthorizedError("Invalid refresh token")
    }

    const accessToken = generateAccessToken(payload.sub)

    return { accessToken }
  }
}

export const authService = new AuthService(
  new AuthRepository(), new SessionRepository()
);