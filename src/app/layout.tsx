import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Furnza — Delivered Orders & Customer Management",
    template: "%s · Furnza",
  },
  description: "Internal dashboard for tracking delivered customer orders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Instant click feedback during navigation — a slim brand-indigo bar
            that fills as the next route loads, so moving between sections never
            feels like a dead pause before the page appears. */}
        <NextTopLoader color="#6366f1" height={3} showSpinner={false} shadow="0 0 8px #6366f1" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
