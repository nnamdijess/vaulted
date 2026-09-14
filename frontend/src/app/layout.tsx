import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unreleased",
  description: "A home for your music in progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
