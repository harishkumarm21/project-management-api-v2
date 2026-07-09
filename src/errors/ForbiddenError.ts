import { AppError } from "./AppError.js";

export class ForbiddenError extends AppError {
  constructor(message = "Access Denied") {
    super(message, 403);
  }
}