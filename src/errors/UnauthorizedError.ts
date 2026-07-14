import { AppError } from "./AppError.js";

export class UnAuthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401)
  }
}