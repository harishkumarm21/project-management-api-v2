import { Request, Response, NextFunction } from "express"
import { authService } from "./auth.service.js";
import { sendSuccess } from "../../utils/api-response.js";

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    const user = await authService.register(req.body)

    return sendSuccess({
      res,
      statusCode: 201,
      message: "User registered successfully.",
      data: user,
    });
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const user = await authService.login(req.body);

    sendSuccess({ res, statusCode: 200, message: "Login Successfully", data: user })
  }
}

export const authController = new AuthController();