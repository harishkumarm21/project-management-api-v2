import { z } from "zod"

///Register
export const registerSchema = z.object({
  email: z.email("Invalid email address").trim().max(320).toLowerCase(),

  password: z.string().trim().min(8, "Password must contain at least 8 characters").max(72),

  displayName: z.string().trim().min(2, "Display name is too short").max(100)
})

export type RegisterInput = z.infer<typeof registerSchema>

///Login
export const loginSchema = z.object({
  email: z.email("Invalid email address").trim().max(320).toLowerCase(),

  password: z.string().trim().min(8, "Password must contain at least 8 characters").max(72),
})

export type LoginInput = z.infer<typeof loginSchema>

//Refresh
export const refreshSchema = z.object({
  refreshToken: z.string().min(1)
})

export type RefreshInput = z.infer<typeof refreshSchema>