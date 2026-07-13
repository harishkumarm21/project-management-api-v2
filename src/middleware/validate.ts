import { ZodTypeAny , ZodError } from "zod";
import { Request, Response, NextFunction } from "express";

import { ValidationError } from "../errors/ValidationError.js";

export function validate(schema: ZodTypeAny ) {
  return (req: Request, _res: Response, next: NextFunction) => {

    try {
      req.body = schema.parse(req.body)

      next();

    } catch (error) {

      if (error instanceof ZodError) {
        return next(new ValidationError(error.issues.map(issue => issue.message).join(", ")))
      }

      next(error);

    }
  }
}