import { ConflictError } from "../../errors/ConflictError.js";
import { AuthRepository } from "./auth.repository.js";
import bcrypt from "bcrypt";
import { LoginInput, RegisterInput } from "./auth.validation.js";
import { UnAuthorizedError } from "../../errors/UnauthorizedError.js";

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) { }
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

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    }
  }
}

export const authService = new AuthService(
  new AuthRepository()
);