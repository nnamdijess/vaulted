"use client";

import { apiUrl, Project } from "@/lib/api";

export function ProjectCover({ project, onClick }: { project: Project; onClick?: () => void }) {
  const artwork = project.cover_path
    // Local user artwork is deliberately served directly; no external image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={apiUrl(`/projects/${project.id}/cover?v=${encodeURIComponent(project.cover_path)}`)} alt={`${project.name} cover`} />
    : <>{project.name.slice(0, 1).toUpperCase()}<span>UNRELEASED</span></>;
  return onClick ? <button className="album-cover cover-button" aria-label={`Change cover for ${project.name}`} onClick={onClick}>{artwork}</button>
    : <div className="album-cover">{artwork}</div>;
}
