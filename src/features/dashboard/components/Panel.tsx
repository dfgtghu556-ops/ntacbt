/**
 * Panel — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

export function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </div>
      {children}
    </section>
  );
}
