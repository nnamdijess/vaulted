import type { Metadata } from "next";
import "./globals.css";
import { AudioPlayerProvider } from "@/components/audio-player";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "Vaulted",
  description: "A home for your music in progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ThemeProvider><AuthProvider><AudioPlayerProvider>{children}</AudioPlayerProvider></AuthProvider></ThemeProvider></body></html>;
}
