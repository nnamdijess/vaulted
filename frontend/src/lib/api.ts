import { API_BASE_URL } from "./config";

export type Project = { id: number; name: string; description: string; artist: string; created_at: string };
export type Song = { id: number; project_id: number; title: string; artist: string; bpm: number | null; key: string; status: string; notes: string; created_at: string; position: number; latest_version_id: number | null };
export type Version = { id: number; song_id: number; version_name: string; file_path: string; original_filename: string; notes: string; created_at: string };

export function apiUrl(path: string) {
  return `${API_BASE_URL.replace(/\/$/, "")}/api${path}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { cache: "no-store", ...init });
  } catch {
    throw new Error("Cannot reach the music API. Check that the backend is running.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : Array.isArray(detail)
      ? detail.map((item: { loc: string[]; msg: string }) => `${item.loc.join(".")}: ${item.msg}`).join("; ")
      : `Request failed (${response.status})`);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function postJson(data: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}
