import { Response, Request, NextFunction } from "express";

import { AppError } from "../errors/AppError.js";
import { sendError } from "../utils/api-response.js";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError({res, statusCode: err.statusCode, message: err.message});

    return;
  }

  console.log(err);

  sendError({res, statusCode: 500, message: "Internal Server Error"});
}