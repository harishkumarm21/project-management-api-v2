import { AppError } from "./AppError.js";

export class unAuthorizedError extends AppError{
  constructor(message = "Authentication required"){
    super(message, 401)
  }
}