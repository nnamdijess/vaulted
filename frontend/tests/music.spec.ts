import { expect, test } from "@playwright/test";

const backend = "http://127.0.0.1:8011/api";

function wav() {
  const rate = 8000;
  const samples = rate * 3;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / rate) * 1000), 44 + i * 2);
  return buffer;
}

test("REST flow, validation, unique storage and byte-range playback", async ({ request }) => {
  expect((await request.get(`${backend}/health`)).status()).toBe(200);
  expect((await request.post(`${backend}/projects`, { data: { name: "   " } })).status()).toBe(422);
  expect((await request.get(`${backend}/projects/99999999/songs`)).status()).toBe(404);
  const created = await request.post(`${backend}/projects`, { data: { name: "API test", description: "Integration" } });
  expect(created.status()).toBe(201);
  const project = await created.json();
  expect((await request.get(`${backend}/projects/${project.id}`)).status()).toBe(200);
  expect((await request.get(`${backend}/projects`)).status()).toBe(200);
  expect((await request.post(`${backend}/projects/${project.id}/songs`, { data: { title: "Bad BPM", bpm: -1 } })).status()).toBe(422);
  const songResponse = await request.post(`${backend}/projects/${project.id}/songs`, { data: { title: "Demo", artist: "Test artist", bpm: 120.5, key: "C minor", status: "demo", notes: "Song notes" } });
  expect(songResponse.status()).toBe(201);
  const song = await songResponse.json();
  expect(song.notes).toBe("Song notes");
  expect((await request.get(`${backend}/songs/${song.id}`)).status()).toBe(200);
  expect((await (await request.get(`${backend}/projects/${project.id}/songs`)).json()).some((item: { id: number }) => item.id === song.id)).toBe(true);
  const upload = (name: string, buffer: Buffer = wav(), versionName = "Demo v1") => request.post(`${backend}/songs/${song.id}/versions`, { multipart: { version_name: versionName, notes: "Version notes", file: { name, mimeType: "audio/wav", buffer } } });
  expect((await upload("no.txt")).status()).toBe(415);
  expect((await upload("empty.wav", Buffer.alloc(0))).status()).toBe(422);
  expect((await upload("large.wav", Buffer.alloc(1048577))).status()).toBe(413);
  expect((await upload("demo.wav", wav(), "   ")).status()).toBe(422);
  const firstResponse = await upload("demo.wav");
  expect(firstResponse.status()).toBe(201);
  const first = await firstResponse.json();
  const second = await (await upload("demo.wav")).json();
  expect(first.file_path).not.toBe(second.file_path);
  expect(first.file_path).toMatch(/^[a-f0-9]{32}\.wav$/);
  expect(first.original_filename).toBe("demo.wav");
  expect(first.notes).toBe("Version notes");
  const versions = await (await request.get(`${backend}/songs/${song.id}/versions`)).json();
  expect(versions).toHaveLength(2);
  const audio = await request.get(`${backend}/versions/${first.id}/audio`);
  expect(audio.status()).toBe(200);
  expect(audio.headers()["content-type"]).toBe("audio/wav");
  expect(await audio.body()).toEqual(wav());
  const range = await request.get(`${backend}/versions/${first.id}/audio`, { headers: { Range: "bytes=0-43", Origin: "http://127.0.0.1:3011" } });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(44);
  expect(range.headers()["access-control-allow-origin"]).toBe("http://127.0.0.1:3011");
  expect(range.headers()["content-range"]).toBe(`bytes 0-43/${wav().length}`);
  expect((await request.get(`${backend}/versions/99999999/audio`)).status()).toBe(404);
  const preflight = await request.fetch(`${backend}/projects`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3011", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
  expect(preflight.status()).toBe(200);
});

test("create project, create song, upload versions and play in browser", async ({ page }) => {
  const projectName = `Browser project ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Project name", { exact: true }).fill(projectName);
  await page.getByLabel("Description", { exact: true }).fill("Browser integration test");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByRole("link").filter({ has: page.getByRole("heading", { name: projectName, exact: true }) }).click();
  await page.getByLabel("Title", { exact: true }).fill("First demo");
  await page.getByLabel("Artist", { exact: true }).fill("Local artist");
  await page.getByLabel("BPM", { exact: true }).fill("124");
  await page.getByLabel("Key", { exact: true }).fill("D minor");
  await page.getByLabel("Song notes", { exact: true }).fill("Try a shorter intro");
  await page.getByRole("button", { name: "Create song", exact: true }).click();
  await page.getByRole("link").filter({ has: page.getByRole("heading", { name: "First demo", exact: true }) }).click();
  await expect(page.getByText("BPM: 124", { exact: true })).toBeVisible();
  await expect(page.getByText("Try a shorter intro", { exact: true })).toBeVisible();
  for (const name of ["Demo v1", "Demo v2"]) {
    await page.getByLabel("Version name", { exact: true }).fill(name);
    await page.getByLabel("Version notes", { exact: true }).fill(`Notes for ${name}`);
    await page.getByLabel("Audio file", { exact: true }).setInputFiles({ name: "demo.wav", mimeType: "audio/wav", buffer: wav() });
    await page.getByRole("button", { name: "Upload version", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.reload();
  const player = page.getByLabel("Play Demo v2", { exact: true });
  await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  await player.evaluate(async (element: HTMLAudioElement) => { element.muted = true; await element.play(); });
  await expect.poll(() => player.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
  await player.evaluate((element: HTMLAudioElement) => { element.currentTime = 1.5; });
  await expect.poll(() => player.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThanOrEqual(1.5);
  await expect(page.getByRole("heading", { name: "Versions (2)", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("song-detail.png"), fullPage: true });
});
