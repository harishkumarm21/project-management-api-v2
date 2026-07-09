import { AppError } from "./AppError.js";

export class ValidationError extends AppError {
  constructor(message = "Validation Failed") {
    super(message, 400);
  }
}