import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vaulted",
    short_name: "Vaulted",
    description: "Your private music workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d0e",
    theme_color: "#0b0d0e",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
