import { SharedProjectView } from '@/components/shared-project';
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedProjectView key={token} token={token} />;
}
