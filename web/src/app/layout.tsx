import { SiteFooter } from "@/components/SiteFooter";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://bookbadmintonslot.netlify.app";

export const metadata: Metadata = {
  title: {
    default: "ShuttleBook — Badminton session booking",
    template: "%s · ShuttleBook",
  },
  description:
    "Book badminton court sessions online. Pay securely, see spots remaining, and manage your bookings.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "ShuttleBook — Badminton session booking",
    description: "Book badminton sessions online with secure card payment.",
    url: siteUrl,
    siteName: "ShuttleBook",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex min-h-screen flex-col antialiased`}>
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
