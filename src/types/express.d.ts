export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser
    }
  }
}

export { };