import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataRoot = path.resolve(__dirname, ".e2e-data");
mkdirSync(dataRoot, { recursive: true });
const python = process.platform === "win32" ? '".venv\\Scripts\\python.exe"' : ".venv/bin/python";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3011", trace: "retain-on-failure" },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8011`,
      cwd: "../backend",
      url: "http://127.0.0.1:8011/api/health",
      env: {
        DATABASE_URL: `sqlite:///${path.join(dataRoot, "music.db").replaceAll("\\", "/")}`,
        UPLOADS_DIR: path.join(dataRoot, "uploads"),
        CORS_ORIGINS: '["http://127.0.0.1:3011"]',
        MAX_UPLOAD_BYTES: "1048576",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3011",
      url: "http://127.0.0.1:3011",
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:8011", NEXT_DIST_DIR: ".next-e2e" },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
