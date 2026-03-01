import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      stellarAddress: string;
      pseudoId: string;
    };
  }
  interface User {
    stellarAddress: string;
    pseudoId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    stellarAddress: string;
    pseudoId: string;
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
  stellarAddress: string;
  pseudoId: string;
  createdAt: Date;
  updatedAt: Date;
}
