import Link from "next/link";

export function ProjectNav({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const links = [
    { href: `/projects/${projectId}`, label: "Overview" },
    { href: `/projects/${projectId}/capture`, label: "Capture" },
    { href: `/projects/${projectId}/search`, label: "Search" },
    { href: `/projects/${projectId}/walkthrough`, label: "Walkthrough" },
    { href: `/projects/${projectId}/export/ha`, label: "HA Export" },
  ];

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
          Projects
        </Link>
        <span className="text-zinc-300">/</span>
        <h1 className="text-sm font-semibold text-zinc-900">{projectName}</h1>
        <nav className="ml-auto flex flex-wrap gap-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function ThreePane({
  left,
  center,
  right,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-7xl grid-cols-1 gap-0 border-x border-zinc-200 md:grid-cols-[240px_1fr_300px]">
      <aside className="border-b border-zinc-200 bg-zinc-50 p-3 md:border-b-0 md:border-r">
        {left}
      </aside>
      <main className="border-b border-zinc-200 bg-white p-4 md:border-b-0">
        {center}
      </main>
      <aside className="bg-zinc-50 p-3 md:border-l md:border-zinc-200">
        {right ?? (
          <p className="text-sm text-zinc-500">Select an entity to inspect.</p>
        )}
      </aside>
    </div>
  );
}
