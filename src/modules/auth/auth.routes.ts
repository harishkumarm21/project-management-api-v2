import { Router } from "express";
import { authController } from "./auth.controller.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.validation.js";
import { validate } from "../../middleware/validate.js";

const authRouter = Router();

authRouter.post("/register", validate(registerSchema), authController.register);

authRouter.post("/login", validate(loginSchema), authController.login);

authRouter.post("/refresh", validate(refreshSchema), authController.refresh)


export {authRouter};