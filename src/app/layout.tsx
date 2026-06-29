import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "RunwayOps Cashflow",
  description: "Approval-gated cashflow assistant for collections, runway planning, and customer outreach."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#050914] antialiased">{children}</body>
    </html>
  );
}
