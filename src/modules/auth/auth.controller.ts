import { Request, Response } from "express"
import { authService } from "./auth.service.js";
import { sendSuccess } from "../../utils/api-response.js";

export class AuthController {
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body)

    return sendSuccess({
      res,
      statusCode: 201,
      message: "User registered successfully.",
      data: user,
    });
  }

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body);

    sendSuccess({ res, statusCode: 200, message: "Login Successfully", data: result })
  }
}

export const authController = new AuthController();