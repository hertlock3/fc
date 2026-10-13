import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SetupBanner } from "@/components/setup-banner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Prime Butchers Cut Market — Fresh food, delivered",
    template: "%s · Prime Butchers Cut Market",
  },
  description:
    "Order fresh Prime Butchers Cut meat and groceries online. Secure M-Pesa checkout, distance-based delivery and same-day rider dispatch across Nairobi.",
  applicationName: "Prime Butchers Cut Market",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-surface-muted">
        <SetupBanner />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
