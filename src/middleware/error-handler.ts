import { Response, Request, NextFunction } from "express";

import { AppError } from "../errors/AppError.js";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message
    });

    return;
  }

  console.log(err);

  res.status(500).json({
    success: false,
    message: "Internal Server Error"
  })
}