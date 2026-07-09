export abstract class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean
  constructor(message: string, statusCode: number) {
    super(message);

    this.name = new.target.name;
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}