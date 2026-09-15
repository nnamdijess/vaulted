import type { Metadata } from "next";
import "./globals.css";
import { AudioPlayerProvider } from "@/components/audio-player";

export const metadata: Metadata = {
  title: "Unreleased",
  description: "A home for your music in progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><AudioPlayerProvider>{children}</AudioPlayerProvider></body></html>;
}
