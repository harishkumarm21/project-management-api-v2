import { Response, Request } from "express";

export function notFound(req: Request, res: Response): void{
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  })
}