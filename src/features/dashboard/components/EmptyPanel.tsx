/**
 * EmptyPanel — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

export function EmptyPanel({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
