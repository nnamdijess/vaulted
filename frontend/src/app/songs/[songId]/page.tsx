import { MusicWorkspace } from "@/components/music-workspace";

export default async function SongPage({ params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params;
  return <MusicWorkspace key={songId} songId={songId} />;
}
