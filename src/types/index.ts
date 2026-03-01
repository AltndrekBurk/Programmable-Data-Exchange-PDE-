import { DefaultSession } from "next-auth";

// Extend the built-in session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}

// Generic API response type
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

// User types
export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}
