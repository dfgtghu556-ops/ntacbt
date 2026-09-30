/**
 * Primary navigation contract.
 *
 * Lives outside the route file so it can be imported by the layout, the mobile
 * drawer and the tests without tripping `react-refresh/only-export-components`.
 *
 * **Invariant the mobile bar depends on:** the bottom nav grid must track
 * `NAV.length`. A hard-coded column count silently wraps the bar onto two rows
 * whenever an entry is added — which is exactly what happened when "Tests" was
 * introduced. `src/test/nav.test.ts` guards this.
 *
 * **Invariant `ALL_NAV` depends on:** every navigable `/app` route appears
 * somewhere in it. Before the mobile drawer existed, the sidebar was the only
 * full nav and it was `hidden lg:flex`, so on a phone the bottom bar's six
 * items were the *whole* navigation — Memory Locker, the syllabus map, Focus,
 * Saarthi and the progress report were reachable only as deep links buried in
 * page content. `/app/report` was not in the sidebar either, so it was
 * unreachable on desktop as well. `nav.test.ts` now asserts coverage of the
 * route directory against this list, so a route added later cannot go orphaned.
 */
import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Clock3,
  FileText,
  Flame,
  LayoutDashboard,
  Map as MapIcon,
  MonitorPlay,
  Play,
  ScrollText,
  Sparkles,
  UserRound,
  TestTube2,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Six primary destinations, rendered in both the sidebar and the bottom bar. */
export const NAV: NavItem[] = [
  { to: "/app", label: "Home", icon: LayoutDashboard },
  { to: "/app/planner", label: "Planner", icon: CalendarDays },
  { to: "/app/studytube", label: "Learn", icon: MonitorPlay },
  { to: "/app/tests", label: "Tests", icon: TestTube2 },
  { to: "/app/pyq", label: "PYQ", icon: FileText },
  { to: "/app/analytics", label: "Progress", icon: BarChart3 },
];

/** Sidebar shortcuts shown above the primary nav. */
export const SHELF: Array<NavItem & { search?: { q: string } }> = [
  { to: "/app/studytube", label: "Home feed", icon: Play },
  { to: "/app/studytube", label: "One-shot", icon: Flame, search: { q: "one shot" } },
  { to: "/app/studytube", label: "Revision", icon: Clock3, search: { q: "revision" } },
  { to: "/app/pyq", label: "PYQ practice", icon: FileText },
  // A secondary surface, not a primary destination: the primary nav stays at
  // the six Phase 6 destinations, and the mobile bottom bar is grid-locked to
  // NAV.length. Adding Memory there would wrap the bar onto two rows.
  { to: "/app/memory", label: "Memory Locker", icon: BrainCircuit },
  { to: "/app/map", label: "Syllabus map", icon: MapIcon },
];

/**
 * The rest of the app: real destinations that are neither primary nor study
 * shortcuts.
 *
 * These are what the mobile drawer exists for. `Boards` and the report were
 * previously only reachable from the desktop sidebar or from inside page
 * content.
 */
export const TOOLS: Array<NavItem & { search?: { q: string } }> = [
  { to: "/app/focus", label: "Focus timer", icon: Clock3 },
  { to: "/app/saarthi", label: "Saarthi", icon: Sparkles },
  { to: "/app/studytube", label: "Boards", icon: Bookmark, search: { q: "board exams" } },
  // The shareable readiness report. It was in neither the sidebar nor the
  // bottom bar, so the only way to reach it was a link on the dashboard or on
  // a result page — a dead end for anyone who landed elsewhere first.
  { to: "/app/report", label: "Progress report", icon: ScrollText },
  // Reachable from the header avatar on every screen, but a drawer that claims
  // to be "everywhere in the app" and omits it is lying.
  { to: "/app/profile", label: "Your profile", icon: UserRound },
];

/**
 * Every navigable destination, in display order.
 *
 * The drawer renders this whole list. `nav.test.ts` asserts that the set of
 * routes in `src/routes/` is a subset of what this covers, which is what stops
 * a new route from being silently unreachable.
 */
export const ALL_NAV: Array<NavItem & { search?: { q: string } }> = [...SHELF, ...NAV, ...TOOLS];

/** A nav group, for the drawer's section headings. */
export interface NavGroup {
  heading: string;
  items: Array<NavItem & { search?: { q: string } }>;
}

export const NAV_GROUPS: NavGroup[] = [
  { heading: "Study", items: SHELF },
  { heading: "Learning OS", items: NAV },
  { heading: "Tools", items: TOOLS },
];
