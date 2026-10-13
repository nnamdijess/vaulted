"use client";
import Link from 'next/link';
import { useState } from 'react';
import { ContentProject } from '@/lib/studio';
import { Modal } from '../modal';

export function RecentProjects({ projects }: { projects: ContentProject[] }) {
  const [all, setAll] = useState(false);
  function cards(items: ContentProject[]) {
    return <div className="studio-cards">{items.map(project => <Link className="studio-card" key={project.id} href={`/studio/${project.id}`}>
      <div className="studio-project-art">{project.cover_path ?
        // eslint-disable-next-line @next/next/no-img-element -- private same-origin artwork
        <img className="studio-cover" alt="Project artwork" src={project.song_id ? `/api/songs/${project.song_id}/cover?v=${encodeURIComponent(project.cover_path)}` : `/api/projects/${project.project_id}/cover?v=${encodeURIComponent(project.cover_path)}`} /> :
        <span className="studio-cover studio-cover-fallback" aria-hidden="true">V</span>}<span className="studio-card-open" aria-hidden="true">↗</span></div>
      <strong title={project.title}>{project.title}</strong><span className="studio-card-song">{project.song_title}</span><span className="studio-project-status">{project.status}</span>
    </Link>)}</div>;
  }
  return <section aria-label="Recent Content Projects">
    <div className="studio-section-heading"><h2>Recent Content Projects</h2>{projects.length > 0 && <button className="studio-text-link" onClick={() => setAll(true)}>View all projects ({projects.length}) →</button>}</div>
    {cards(projects.slice(0, 5))}
    {all && <Modal title="All content projects" className="studio-gallery-dialog" onClose={() => setAll(false)}>{cards(projects)}</Modal>}
  </section>;
}
