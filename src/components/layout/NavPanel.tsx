/**
 * The navigation panel, shared by the desktop sidebar and the mobile drawer.
 *
 * Before this existed the sidebar's markup was written inline in
 * `app.tsx` and the bottom bar had its own copy of the active-state
 * logic. Two surfaces, two implementations, and no third place a phone could
 * reach the app from — which is why five routes were unreachable on mobile.
 *
 * One component, one active-state rule, used everywhere. Adding a route to
 * `NAV_GROUPS` now reaches both surfaces at once.
 */
import { Link } from "@tanstack/react-router";
import { NAV_GROUPS, type NavItem } from "./nav";

/** Matches `/app/tests` and `/app/tests.$video`, but not `/app/tests-archive`. */
function isActive(current: string, to: string): boolean {
  return current === to || current.startsWith(`${to}.`) || current.startsWith(`${to}/`);
}

interface NavRowProps {
  item: NavItem & { search?: { q: string } };
  current: string;
  onNavigate?: () => void;
}

function NavRow({ item, current, onNavigate }: NavRowProps) {
  const Icon = item.icon;
  const active = isActive(current, item.to);
  return (
    <Link
      to={item.to}
      {...(item.search ? { search: item.search } : {})}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
        active ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-accent/60"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {item.label}
    </Link>
  );
}

interface NavPanelProps {
  /** The current route id, so exactly one row is marked active. */
  current: string;
  /**
   * Called after a navigation. The drawer passes a close handler here so
   * tapping a destination dismisses it — a drawer that stays open over the page
   * you just asked for feels broken.
   */
  onNavigate?: () => void;
  /** Show the group headings. The sidebar wants them; a compact list may not. */
  showHeadings?: boolean;
}

export function NavPanel({ current, onNavigate, showHeadings = true }: NavPanelProps) {
  return (
    <div className="grid gap-1">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="grid gap-1">
          {showHeadings ? (
            <div className="mb-1 mt-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.heading}
            </div>
          ) : null}
          {group.items.map((item) => (
            <NavRow
              key={`${group.heading}-${item.label}`}
              item={item}
              current={current}
              {...(onNavigate ? { onNavigate } : {})}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
