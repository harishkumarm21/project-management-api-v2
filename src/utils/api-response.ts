import { Response } from "express";

export interface ApiSuccessResponse<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
}

interface SendSuccessOptions<T> {
  res: Response;
  statusCode: number;
  message?: string;
  data: T;
}

interface SendErrorOptions {
  res: Response;
  statusCode: number;
  message: string;
}

export function sendSuccess<T>({
  res,
  statusCode,
  message,
  data,
}: SendSuccessOptions<T>): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
  };

  res.status(statusCode).json(response);
}

export function sendError({
  res,
  statusCode,
  message,
}: SendErrorOptions): void {
  const response: ApiErrorResponse = {
    success: false,
    message,
  };

  res.status(statusCode).json(response);
}