import { Response, Request } from "express";
import { sendError } from "../utils/api-response.js";

export function notFound(req: Request, res: Response): void{
  sendError({res, statusCode: 404, message: `Route ${req.originalUrl} not found`});
}