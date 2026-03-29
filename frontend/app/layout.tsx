import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clementine | The Orchard Matchmaker",
  description:
    "Clementine pairs apples and oranges through SurrealDB-backed matching, harmonic-mean reranking, and conversational explanations.",
  keywords: ["matchmaking", "surrealdb", "apples", "oranges", "ai"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
