import { Studio } from '@/components/studio/workspace';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Studio identifier={id} />;
}
