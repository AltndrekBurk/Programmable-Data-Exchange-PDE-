import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

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
        if (
          !credentials?.publicKey ||
          !credentials?.signature ||
          !credentials?.challenge
        ) {
          return null;
        }
        try {
          // Backend'e doğrulama isteği at
          const res = await fetch("http://localhost:3001/api/auth/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              publicKey: credentials.publicKey,
              signature: credentials.signature,
              challenge: credentials.challenge,
            }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          // NextAuth User tipini karşılamak için tüm required alanlar dönülmeli
          return {
            id: data.pseudoId as string,
            name: data.pseudoId as string,
            stellarAddress: credentials.publicKey,
            pseudoId: data.pseudoId as string,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.stellarAddress = (
          user as { stellarAddress: string }
        ).stellarAddress;
        token.pseudoId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { stellarAddress: string; pseudoId: string }).stellarAddress =
          (token.stellarAddress as string | undefined) ?? "";
        (session.user as { stellarAddress: string; pseudoId: string }).pseudoId =
          (token.pseudoId as string | undefined) ?? "";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" as const },
  secret: process.env.NEXTAUTH_SECRET,
};
