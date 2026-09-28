/**
 * Primary navigation contract.
 *
 * Lives outside the route file so it can be imported by the layout, the mobile
 * bar and the tests without tripping `react-refresh/only-export-components`.
 *
 * **Invariant the mobile bar depends on:** the bottom nav grid must track
 * `NAV.length`. A hard-coded column count silently wraps the bar onto two rows
 * whenever an entry is added — which is exactly what happened when "Tests" was
 * introduced. `src/test/nav.test.ts` guards this.
 */
import {
  BarChart3,
  CalendarDays,
  Clock3,
  FileText,
  Flame,
  LayoutDashboard,
  MonitorPlay,
  Play,
  TestTube2,
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
];
