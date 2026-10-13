
export type Project = { owner_name: string; id: number; name: string; description: string; artist: string; created_at: string; cover_path: string | null; notes: string };
export type Song = { cover_path?: string | null; id: number; project_id: number; title: string; artist: string; bpm: number | null; key: string; status: string; notes: string; created_at: string; position: number; latest_version_name?: string | null; latest_version_id: number | null };
export type Version = { id: number; song_id: number; version_name: string; file_path: string; original_filename: string; notes: string; created_at: string };

export function apiUrl(path: string) {
  return `/api${path}`;
}

export function projectCoverUrl(project?: Project | null): string | undefined {
  return project?.cover_path ? apiUrl(`/projects/${project.id}/cover?v=${encodeURIComponent(project.cover_path)}`) : undefined;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.body instanceof FormData) {
    const bytes = Array.from(init.body.values()).reduce((sum, value) => sum + (value instanceof Blob ? value.size : 0), 0);
    if (bytes > 500 * 1024 * 1024) {
      throw new Error("These files exceed the 500 MiB upload batch limit. Choose fewer files and upload them in separate batches.");
    }
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new Error("Cannot reach the music API. Check that the backend is running.");
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined' && !window.location.pathname.startsWith('/share/')) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- discard expired private state
      window.location.assign('/login');
    }
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
