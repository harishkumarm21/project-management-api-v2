import { Router } from "express";
import { authController } from "./auth.controller.js";
import { registerSchema } from "./auth.validation.js";
import { validate } from "../../middleware/validate.js";

const authRouter = Router();

authRouter.post("/register", validate(registerSchema), authController.register);
///Argument of type 'ZodObject<{ email: ZodEmail; password: ZodString; displayName: ZodString; }, $strip>' is not assignable to parameter of type 'AnyZodObject'.
  // Type 'ZodObject<{ email: ZodEmail; password: ZodString; displayName: ZodString; }, $strip>' is missing the following properties from type 'ZodObject<any, any, any, { [x: string]: any; }, { [x: string]: any; }>': _cached, _getCached, _parse, nonstrict, and 13 more

export {authRouter};