import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/providers/SessionProvider";
import Navbar from "@/components/layout/Navbar";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
