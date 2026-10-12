"use client";
import Link from 'next/link';
import { useState } from 'react';
import { ContentProject } from '@/lib/studio';
import { Modal } from '../modal';

export function RecentProjects({ projects }: { projects: ContentProject[] }) {
  const [all, setAll] = useState(false);
  function cards(items: ContentProject[]) {
    return <div className="studio-cards">{items.map(project => <Link className="studio-card" key={project.id} href={`/studio/${project.id}`}>
      {project.cover_path ?
        // eslint-disable-next-line @next/next/no-img-element -- private same-origin artwork
        <img className="studio-cover" alt="Project artwork" src={`/api/projects/${project.project_id}/cover?v=${encodeURIComponent(project.cover_path)}`} /> :
        <span className="studio-cover studio-cover-fallback" aria-hidden="true">V</span>}
      <strong>{project.title}</strong><span>{project.song_title} · {project.status}</span>
    </Link>)}</div>;
  }
  return <section aria-label="Recent Content Projects">
    <div className="studio-section-heading"><h2>Recent Content Projects</h2>{projects.length > 0 && <button className="studio-text-link" onClick={() => setAll(true)}>View all projects ({projects.length}) →</button>}</div>
    {cards(projects.slice(0, 5))}
    {all && <Modal title="All content projects" className="studio-gallery-dialog" onClose={() => setAll(false)}>{cards(projects)}</Modal>}
  </section>;
}
