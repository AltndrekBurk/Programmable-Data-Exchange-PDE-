import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "@/components/providers/SessionProvider";
import Navbar from "@/components/layout/Navbar";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "PDE — Programmable Data Exchange",
  description:
    "ZK proof ile kanitlanmis veri ekonomisi. Ham veri kimseye gorunmez, sadece kriptografik kanit akar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          <ToastProvider>
            <Navbar />
            <main className="min-h-[calc(100vh-4rem)]">{children}</main>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
