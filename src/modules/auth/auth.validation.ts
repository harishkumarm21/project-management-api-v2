import { z } from "zod"

export const registerSchema = z.object({
  email: z.email("Invalid email address").trim().max(320).toLowerCase(),

  password: z.string().trim().min(8, "Password must contain at least 8 characters").max(72),

  displayName: z.string().trim().min(2, "Display name is too short").max(100)

})

export type RegisterInput = z.infer<typeof registerSchema>