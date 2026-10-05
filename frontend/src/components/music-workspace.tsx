"use client";
import { PlayerIcon } from "./player-icon";
import { WorkspaceNav } from './workspace-nav';

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, postJson, Project, projectCoverUrl, Song, Version } from "@/lib/api";
import { QueueTrack, trackFor, usePlayer } from "./audio-player";
import { OrderedTracks } from "./ordered-tracks";
import { Modal } from "./modal";
import { SongActions } from "./song-actions";
import { ProjectActions, ProjectAction } from "./project-actions";
import { ProjectCover } from "./project-cover";
import { AccountArea, PrivateArea, useAuth } from './auth-provider';

export function MusicWorkspace({ projectId, songId }: { projectId?: string; songId?: string }) {
  return <PrivateArea><WorkspaceContent projectId={projectId} songId={songId} /></PrivateArea>;
}

function WorkspaceContent({ projectId, songId }: { projectId?: string; songId?: string }) {
  const { user } = useAuth();
  const libraryName = user?.library_name ?? "Vault";
  const [projectAction, setProjectAction] = useState<ProjectAction | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"project" | "tracks" | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [revision, setRevision] = useState(0);
  const player = usePlayer();
  const router = useRouter();

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
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Unable to load your library."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [projectId, songId, revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setDialogError("");
    try {
      if (dialog === "tracks") {
        const created = await api<Song[]>(`/projects/${projectId}/tracks`, { method: "POST", body: data });
        setSongs((items) => [...items, ...created].sort((a, b) => a.position - b.position || a.id - b.id));
        setNotice(`${created.length} ${created.length === 1 ? "track" : "tracks"} added.`);
      } else {
        const project = await api<Project>("/projects", postJson(Object.fromEntries(data)));
        setProjects((items) => [project, ...items]);
        setNotice("Project created. Open it to add tracks.");
      }
      setDialog(null);
    } catch (err) { setDialogError(err instanceof Error ? err.message : "Upload failed. Please try again."); }
    finally { setBusy(false); }
  }
  function openDialog(value: "project" | "tracks") { setDialogError(""); setDialog(value); }
  function onChange(updated: Song) {
    setSongs((items) => items.map((item) => item.id === updated.id ? updated : item));
    if (songId) { setSong(updated); setRevision((value) => value + 1); }
  }
  function onDelete(id: number) {
    setSongs((items) => items.filter((item) => item.id !== id));
    setNotice("Song deleted.");
    if (songId && project) router.push(`/projects/${project.id}`);
  }
  const queue = songs.map((item) => trackFor(item, project)).filter((track): track is QueueTrack => track !== null);
  function playSong(item: Song) {
    if (player.current?.songId === item.id && player.current.versionId === item.latest_version_id) player.toggle();
    else player.playQueue(queue, queue.findIndex((track) => track.songId === item.id));
  }

  return <main>
    <header><Link href="/" className="brand">vaulted<span className="dot">.</span></Link><AccountArea /></header>
    <WorkspaceNav />
    <nav aria-label="Breadcrumb"><Link href="/projects">{libraryName}</Link>{project && <> / <Link href={`/projects/${project.id}`}>{project.name}</Link></>}{song && <> / <span>{song.title}</span></>}</nav>
    {error && <div className="error" role="alert">{error} <button onClick={() => { setError(""); setLoading(true); setRevision((value) => value + 1); }}>Retry</button></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {loading ? <p role="status">Loading your music…</p> : songId ? song && <>
      <div className="section-heading"><div><p className="eyebrow">TRACK / {song.position}</p><h1>{song.title}</h1><p className="muted">{song.artist || project?.artist || libraryName}</p></div><SongActions song={song} onChange={onChange} onDelete={onDelete} /></div>
      <div className="metadata"><span>BPM: {song.bpm ?? "—"}</span><span>Key: {song.key || "—"}</span><span>Status: {song.status}</span></div>
      {song.notes && <p className="notes">{song.notes}</p>}
      <div className="section-heading"><h2>Versions ({versions.length})</h2><p className="muted">Use the track menu to add a version.</p></div>
      <div className="version-list">{versions.map((version) => <article className="version-row" key={version.id}>
        <button className="row-play" aria-label={`Play ${version.version_name}`} onClick={() => {
          if (player.current?.versionId === version.id) player.toggle();
          else player.playQueue([{ songId: song.id, title: song.title, artist: song.artist, fallbackArtist: project?.artist || project?.owner_name || "", usesOwnerName: !project?.artist, versionName: version.version_name, versionId: version.id, projectId: song.project_id, coverUrl: projectCoverUrl(project) }]);
        }}><PlayerIcon name={player.current?.versionId === version.id && player.playing ? "pause" : "play"} /></button>
        <div><h3>{version.version_name}</h3><p className="muted">{version.original_filename} · {new Date(version.created_at).toLocaleDateString()}</p>{version.notes && <p className="notes">{version.notes}</p>}</div>
      </article>)}</div>
      {!versions.length && <p className="empty">This track has no audio yet. Use its menu to upload a version.</p>}
    </> : projectId ? project && <>
      <section className="album-header">
        <ProjectCover project={project} onClick={() => setProjectAction("Change cover")} />
        <div><div className="project-heading"><p className="eyebrow">PROJECT</p><ProjectActions project={project} songs={songs} action={projectAction} setAction={setProjectAction} onChange={(updated) => { setProject(updated); player.updateProject(updated); }} /></div><h1>{project.name}</h1><p className="album-subtitle">{project.artist || libraryName} <span>· {songs.length} {songs.length === 1 ? "track" : "tracks"}</span></p>
          {project.description && <p className="description">{project.description}</p>}
          <div className="album-buttons"><button disabled={!queue.length} onClick={() => player.playQueue(queue)}><PlayerIcon name="play" /> Play All</button><button className="secondary" onClick={() => openDialog("tracks")}>＋ Add Tracks</button></div>
        </div>
      </section>
      <OrderedTracks songs={songs} currentId={player.current?.songId} onReorder={async ordered => {
        try {
          await api(`/projects/${projectId}/order`, { ...postJson({ song_ids: ordered.map(item => item.id) }), method: 'PATCH' });
          const updated = ordered.map((item, index) => ({ ...item, position: index + 1 }));
          setSongs(updated); player.reorderProject(Number(projectId), updated.map(item => item.id));
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not save track order'); setRevision(value => value + 1); throw err; }
      }}>{item => <>
        <button className="row-play" aria-label={`${player.current?.songId === item.id && player.playing ? "Pause" : "Play"} ${item.title}`} disabled={!item.latest_version_id} onClick={() => playSong(item)}><PlayerIcon name={player.current?.songId === item.id && player.playing ? "pause" : "play"} /></button>
        <div className="track-title"><Link href={`/songs/${item.id}`}>{item.title}</Link><time dateTime={item.created_at}>Uploaded {new Date(item.created_at).toLocaleDateString()}</time></div>
        <SongActions song={item} onChange={onChange} onDelete={onDelete} />
      </>}</OrderedTracks>
      {!songs.length && <div className="empty"><h2>Start with the music.</h2><p>Add one or several recordings. Names come from your files; details can wait.</p><button className="secondary" onClick={() => openDialog("tracks")}>Add Tracks</button></div>}
    </> : <>
      <div className="section-heading"><div><p className="eyebrow">YOUR MUSIC, IN PROGRESS</p><h1>{libraryName}</h1></div><button onClick={() => openDialog("project")}>＋ New Project</button></div>
      <div className="project-grid">{projects.map((item) => <Link className="project-tile" href={`/projects/${item.id}`} key={item.id}><ProjectCover project={item} /><h2>{item.name}</h2><p className="muted">{item.artist || libraryName}</p></Link>)}</div>
      {!projects.length && <p className="empty">Create a project, then add your recordings.</p>}
    </>}
    {dialog && <Modal title={dialog === "tracks" ? "Add Tracks" : "New Project"} onClose={() => setDialog(null)} busy={busy}>
      <form onSubmit={submit}>{dialogError && <p role="alert" className="error">{dialogError}</p>}<fieldset disabled={busy}>
        {dialog === "tracks" ? <><p className="muted">Each file becomes a track with its original version. Add details whenever you’re ready.</p><label>Audio files<input name="files" type="file" multiple required accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.opus,.aif,.aiff" /></label><p className="muted">Up to 50 files and 500 MiB total per batch. If a file fails, the entire batch is rolled back.</p></> : <>
          <label>Project name<input name="name" required maxLength={200} /></label><label>Artist / owner<input name="artist" maxLength={200} /></label><label>Description<textarea name="description" maxLength={10000} rows={3} /></label>
        </>}
        <div className="dialog-buttons"><button className="secondary" type="button" onClick={() => setDialog(null)}>Cancel</button><button type="submit">{busy ? "Saving…" : dialog === "tracks" ? "Upload tracks" : "Create project"}</button></div>
      </fieldset></form>
    </Modal>}
    <footer>VAULTED <span>Your local music workspace.</span></footer>
  </main>;
}
