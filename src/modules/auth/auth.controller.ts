import { Request, Response, NextFunction } from "express"
import { authService } from "./auth.service.js";
import { sendSuccess } from "../../utils/api-response.js";

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {

      const user = await authService.register(req.body)

      return sendSuccess({
        res,
        statusCode: 201,
        message: "User registered successfully.",
        data: user,
      });

    } catch (error) {
      next(error)
    }
  }
}

export const authController = new AuthController();