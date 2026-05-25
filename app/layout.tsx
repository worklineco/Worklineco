import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkLine Co",
  description: "Configurable ERP and workflow operating system for professional firms."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
