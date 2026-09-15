import type { Metadata } from "next";
import "./globals.css";
import { AudioPlayerProvider } from "@/components/audio-player";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Unreleased",
  description: "A home for your music in progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ThemeProvider><AudioPlayerProvider>{children}</AudioPlayerProvider></ThemeProvider></body></html>;
}
