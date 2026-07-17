import { Router } from "express";
import { authController } from "./auth.controller.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./auth.validation.js";
import { validate } from "../../middleware/validate.js";
import { Authenticate } from "../../middleware/auth.js";
import { sendSuccess } from "../../utils/api-response.js";

const authRouter = Router();


// Client
//  │
//  │ POST /register
//  ▼
// Route
//  │
//  ▼
// Validation Middleware
//  │
//  │ Invalid?
//  ├────────► 400
//  │
//  ▼
// Controller
//  │
//  ▼
// Service
//  │
//  │ Duplicate?
//  ├────────► 409
//  │
//  ▼
// Hash Password
//  │
//  ▼
// Repository
//  │
//  ▼
// Prisma
//  │
//  ▼
// PostgreSQL
//  │
//  ▼
// Controller
//  │
//  ▼
// successResponse()
//  │
//  ▼
// 201 Created
authRouter.post("/register", validate(registerSchema), authController.register);


// POST /login
//         │
//         ▼
// Validate request
//         │
//         ▼
// Find user
//         │
//         ▼
// Compare password
//         │
//         ▼
// Generate Access Token
//         │
//         ▼
// Generate Refresh Token
//         │
//         ▼
// Hash Refresh Token
//         │
//         ▼
// Create Session
//         │
//         ▼
// Return user + tokens
authRouter.post("/login", validate(loginSchema), authController.login);


// POST /refresh
//         │
// Receive Refresh Token
//         │
// Verify JWT Signature
//         │
// Hash Token
//         │
// Find Session
//         │
// Check Session Exists
//         │
// Check Not Revoked
//         │
// Generate New Access Token
//         │
// Return Access Token
authRouter.post("/refresh", validate(refreshSchema), authController.refresh)

// Client
//    │
// POST /logout
//    │
// refreshToken
//    │
// Verify Refresh Token
//    │
// Hash Refresh Token
//    │
// Find Session
//    │
// Revoke Session
//    │
// 200 OK
authRouter.post("/logout", validate(logoutSchema), authController.logout)


authRouter.get("/me", Authenticate, (req, res) => {
  sendSuccess({
    res, statusCode: 200,
    data: req.user
  });
})


export { authRouter };