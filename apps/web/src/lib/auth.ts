import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Stellar Wallet",
      credentials: {
        publicKey: { label: "Public Key", type: "text" },
        signature: { label: "Signature", type: "text" },
        challenge: { label: "Challenge", type: "text" },
      },
      async authorize(credentials) {
        const publicKey =
          (credentials as { publicKey?: string } | null)?.publicKey || "unknown";
        return {
          id: publicKey,
          name: publicKey,
          stellarAddress: publicKey,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.stellarAddress = (
          user as { stellarAddress: string }
        ).stellarAddress;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { stellarAddress: string }).stellarAddress =
          (token.stellarAddress as string | undefined) ?? "";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" as const },
  secret: process.env.NEXTAUTH_SECRET,
};
