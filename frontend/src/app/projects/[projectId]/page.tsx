import { MusicWorkspace } from "@/components/music-workspace";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <MusicWorkspace key={projectId} projectId={projectId} />;
}
