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
    icons: [{ src: "/vaulted-logo.png", sizes: "736x736", type: "image/png", purpose: "any" }],
  };
}
