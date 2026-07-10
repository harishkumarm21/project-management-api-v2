import { Response } from "express";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
}

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  data: T
): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string
): void {
  const response: ApiErrorResponse = {
    success: false,
    message,
  };

  res.status(statusCode).json(response);
}