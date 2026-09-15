"use client";

import { FormEvent, useState } from "react";
import { api, apiUrl, postJson, Song } from "@/lib/api";
import { usePlayer } from "./audio-player";
import { Modal } from "./modal";

type Action = "Rename" | "Edit details" | "Upload new version" | "Delete";
export function SongActions({ song, onChange, onDelete }: { song: Song; onChange: (song: Song) => void; onDelete: (id: number) => void }) {
  const [menu, setMenu] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const player = usePlayer();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    setBusy(true); setError("");
    try {
      if (action === "Delete") {
        await api(`/songs/${song.id}`, { method: "DELETE" });
        player.removeSong(song.id);
        onDelete(song.id);
      } else if (action === "Upload new version") {
        await api(`/songs/${song.id}/versions`, { method: "POST", body: data });
        onChange(await api<Song>(`/songs/${song.id}`));
      } else {
        const body = action === "Rename" ? { title: value("title") } : {
          title: value("title"), artist: value("artist"), bpm: value("bpm") ? Number(value("bpm")) : null,
          key: value("key"), status: value("status") || "demo", notes: value("notes"),
        };
        const updated = await api<Song>(`/songs/${song.id}`, { ...postJson(body), method: "PATCH" });
        player.updateSong(updated); onChange(updated);
      }
      setAction(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save changes."); }
    finally { setBusy(false); }
  }

  return <div className="song-actions" onKeyDown={(event) => { if (event.key === "Escape") setMenu(false); }}>
    <button className="icon-button" aria-label={`Actions for ${song.title}`} aria-expanded={menu} onClick={() => setMenu(!menu)}>•••</button>
    {menu && <>
      <button className="menu-dismiss" aria-label="Close track actions" onClick={() => setMenu(false)} />
      <div className="actions-menu">
        {(["Rename", "Edit details", "Upload new version"] as Action[]).map((item) => <button key={item} onClick={() => { setAction(item); setMenu(false); setError(""); }}>{item}</button>)}
        {song.latest_version_id ? <a href={apiUrl(`/versions/${song.latest_version_id}/audio?download=true`)} onClick={() => setMenu(false)}>Download</a> : <button disabled>Download</button>}
        <button className="danger-text" onClick={() => { setAction("Delete"); setMenu(false); setError(""); }}>Delete</button>
      </div>
    </>}
    {action && <Modal title={action} onClose={() => setAction(null)} busy={busy}>
      <form onSubmit={submit}>
        {error && <p role="alert" className="error">{error}</p>}
        <fieldset disabled={busy}>
          {action === "Delete" ? <p>Delete “{song.title}” and all its versions? This removes its audio files and cannot be undone.</p>
          : action === "Upload new version" ? <>
            <p className="muted">Add another recording to “{song.title}”. The track stays in its current position.</p>
            <label>Version name<input name="version_name" required maxLength={200} defaultValue="New version" /></label>
            <label>Version notes<textarea name="notes" rows={3} maxLength={10000} /></label>
            <label>Audio file<input name="file" type="file" required accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.opus,.aif,.aiff" /></label>
          </> : <>
            <label>Title<input name="title" required maxLength={200} defaultValue={song.title} /></label>
            {action === "Edit details" && <>
              <label>Artist<input name="artist" maxLength={200} defaultValue={song.artist} /></label>
              <div className="form-row"><label>BPM<input name="bpm" type="number" min="0.01" max="1000" step="any" defaultValue={song.bpm ?? ""} /></label><label>Key<input name="key" maxLength={50} defaultValue={song.key} /></label></div>
              <label>Status<input name="status" maxLength={50} defaultValue={song.status} placeholder="demo" /></label>
              <label>Song notes<textarea name="notes" maxLength={10000} rows={4} defaultValue={song.notes} /></label>
            </>}
          </>}
          <div className="dialog-buttons"><button className="secondary" type="button" onClick={() => setAction(null)}>Cancel</button><button className={action === "Delete" ? "danger" : ""} type="submit">{busy ? "Saving…" : action === "Delete" ? "Delete song" : action === "Upload new version" ? "Upload version" : "Save changes"}</button></div>
        </fieldset>
      </form>
    </Modal>}
  </div>;
}
