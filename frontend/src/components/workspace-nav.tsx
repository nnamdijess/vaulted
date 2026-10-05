import Link from 'next/link';
export function WorkspaceNav({ studio = false }: { studio?: boolean }) {
  return <nav className="workspace-nav" aria-label="Workspace"><Link href="/projects" aria-current={!studio ? 'page' : undefined}>Library</Link><Link href="/studio" aria-current={studio ? 'page' : undefined}>Studio</Link></nav>;
}
