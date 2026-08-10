import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { FeedbackButton } from "@/components/feedback-button";
import { GlobalEscapeCloser } from "@/components/layout/global-escape-closer";

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
      <body>
        <GlobalEscapeCloser />
        <AppShell>{children}</AppShell>
        <FeedbackButton />
      </body>
    </html>
  );
}
