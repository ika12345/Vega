import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Vega - AI Agent Marketplace on Solana",
  description: "Vega — Pay-per-use AI Agents powered by SOL micropayments on Solana.",
};

import { FundingAssistant } from "@/components/FundingAssistant";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  // Get the cookie header string - format as "name=value; name2=value2"
  const cookieHeader = cookieStore.getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ') || null;
  
  return (
    <html lang="en">
      <body>
        <Providers cookies={cookieHeader}>
          {children}
          <FundingAssistant />
        </Providers>
      </body>
    </html>
  );
}
