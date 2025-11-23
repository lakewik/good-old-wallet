import type { Metadata } from "next";
import { Geist, Geist_Mono, Castoro_Titling } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const castoroTitling = Castoro_Titling({
  variable: "--font-castoro-titling",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Good Old Wallet",
  description: "Abstracted wallet for multi-chain token management",
  generator: "v0.app",
  icons: {
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${castoroTitling.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}