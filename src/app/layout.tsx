import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IntervAI - AI Mock Interview Platform",
  description: "Conduct dynamic, voice-only mock interviews with an adaptive AI interviewer and get detailed STAR scorecard reports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
