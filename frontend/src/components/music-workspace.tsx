"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, apiUrl, postJson, Project, Song, Version } from "@/lib/api";

function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }

export function MusicWorkspace({ projectId, songId }: { projectId?: string; songId?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (songId) {
          const [nextSong, nextVersions] = await Promise.all([api<Song>(`/songs/${songId}`), api<Version[]>(`/songs/${songId}/versions`)]);
          const nextProject = await api<Project>(`/projects/${nextSong.project_id}`);
          if (active) { setSong(nextSong); setVersions(nextVersions); setProject(nextProject); }
        } else if (projectId) {
          const [nextProject, nextSongs] = await Promise.all([api<Project>(`/projects/${projectId}`), api<Song[]>(`/projects/${projectId}/songs`)]);
          if (active) { setProject(nextProject); setSongs(nextSongs); }
        } else {
          const nextProjects = await api<Project[]>("/projects");
          if (active) setProjects(nextProjects);
        }
      } catch (err) { if (active) setError(message(err)); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [projectId, songId, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    setSaving(true); setError(""); setNotice("");
    try {
      if (songId) {
        const version = await api<Version>(`/songs/${songId}/versions`, { method: "POST", body: data });
        setVersions((items) => [version, ...items]);
        setNotice("Audio version uploaded.");
      } else if (projectId) {
        const created = await api<Song>(`/projects/${projectId}/songs`, postJson({ title: value("title"), artist: value("artist"), bpm: value("bpm") ? Number(value("bpm")) : null, key: value("key"), status: value("status"), notes: value("notes") }));
        setSongs((items) => [created, ...items]);
        setNotice("Song created. Open it to upload a version.");
      } else {
        const created = await api<Project>("/projects", postJson({ name: value("name"), description: value("description") }));
        setProjects((items) => [created, ...items]);
        setNotice("Project created.");
      }
      form.reset();
    } catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  }

  return (
    <main>
      <header><Link href="/" className="brand">unreleased<span className="dot">.</span></Link><span className="badge">LOCAL WORKSPACE</span></header>
      <nav aria-label="Breadcrumb"><Link href="/projects">Projects</Link>{project && <> / <Link href={`/projects/${project.id}`}>{project.name}</Link></>}{song && <> / <span>{song.title}</span></>}</nav>
      {error && <div className="error" role="alert">{error} <button type="button" onClick={() => { setError(""); setLoading(true); setRetry((n) => n + 1); }}>Reload data</button></div>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {loading ? <p role="status">Loading your music…</p> : (
        <>
          <h1>{songId ? song?.title ?? "Song unavailable" : projectId ? project?.name ?? "Project unavailable" : "Projects"}</h1>
          {!songId && <p className="intro">{projectId ? project?.description : "Organize your music in progress. Create a project to get started."}</p>}
          {song && <div className="metadata"><span>Artist: {song.artist || "—"}</span><span>BPM: {song.bpm ?? "—"}</span><span>Key: {song.key || "—"}</span><span>Status: {song.status}</span><p className="notes">{song.notes || "No song notes yet."}</p></div>}
          {(!projectId && !songId || projectId && project || songId && song) && <div className="workspace">
            <section aria-label={songId ? "Versions" : projectId ? "Songs" : "Projects"}>
              <h2>{songId ? `Versions (${versions.length})` : projectId ? `Songs (${songs.length})` : `Your projects (${projects.length})`}</h2>
              {songId ? versions.length ? versions.map((version) => <article className="card" key={version.id}>
                <h3>{version.version_name}</h3><p className="muted">{version.original_filename} · {new Date(version.created_at).toLocaleString()}</p>
                <p className="notes">{version.notes || "No version notes."}</p>
                <audio controls preload="metadata" aria-label={`Play ${version.version_name}`} src={apiUrl(`/versions/${version.id}/audio`)} onError={() => setError(`Could not play ${version.version_name}. Check the audio file and browser codec support.`)} />
              </article>) : <p className="empty">No versions yet. Upload the first recording.</p>
              : projectId ? songs.length ? songs.map((item) => <Link className="card item" href={`/songs/${item.id}`} key={item.id}><h3>{item.title}</h3><p>{item.artist || "Unknown artist"} · {item.status}</p><span>Open song →</span></Link>) : <p className="empty">No songs yet. Add your first song.</p>
              : projects.length ? projects.map((item) => <Link className="card item" href={`/projects/${item.id}`} key={item.id}><h3>{item.name}</h3><p className="notes">{item.description || "No description."}</p><span>Open project →</span></Link>) : <p className="empty">No projects yet. Create your first project.</p>}
            </section>
            <section className="card form-panel" aria-labelledby="form-title">
              <h2 id="form-title">{songId ? "Upload a version" : projectId ? "Create a song" : "Create a project"}</h2>
              <form onSubmit={submit}><fieldset disabled={saving}>
                {songId ? <>
                  <label>Version name<input name="version_name" required maxLength={200} placeholder="Demo v1" /></label>
                  <label>Version notes<textarea name="notes" maxLength={10000} rows={4} /></label>
                  <label>Audio file<input name="file" type="file" required accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.opus,.aif,.aiff" /></label>
                  <p className="muted">Up to 250 MiB by default. Playback depends on browser codec support.</p>
                </> : projectId ? <>
                  <label>Title<input name="title" required maxLength={200} /></label>
                  <label>Artist<input name="artist" maxLength={200} /></label>
                  <div className="form-row"><label>BPM<input name="bpm" type="number" min="0.01" max="1000" step="any" /></label><label>Key<input name="key" maxLength={50} placeholder="C minor" /></label></div>
                  <label>Status<select name="status" defaultValue="demo"><option value="idea">Idea</option><option value="demo">Demo</option><option value="in progress">In progress</option><option value="mixing">Mixing</option><option value="mastered">Mastered</option><option value="finished">Finished</option></select></label>
                  <label>Song notes<textarea name="notes" maxLength={10000} rows={4} /></label>
                </> : <>
                  <label>Project name<input name="name" required maxLength={200} /></label>
                  <label>Description<textarea name="description" maxLength={10000} rows={4} /></label>
                </>}
                <button type="submit">{saving ? songId ? "Uploading…" : "Saving…" : songId ? "Upload version" : projectId ? "Create song" : "Create project"}</button>
              </fieldset></form>
            </section>
          </div>}
        </>
      )}
      <footer>UNRELEASED <span>Your local music workspace.</span></footer>
    </main>
  );
}
