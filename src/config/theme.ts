/**
 * Design tokens, mirrored from `src/styles.css`.
 *
 * The stylesheet is the source of truth for what the browser actually paints;
 * this module exists so non-CSS code (charts, canvas, exports, tests) can read
 * the same palette without hard-coding hex values. Keep the two in sync.
 */

export interface ThemePalette {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
}

export const theme = {
  light: {
    background: "hsl(0 0% 100%)",
    foreground: "hsl(222.2 84% 4.9%)",
    primary: "hsl(221.2 83.2% 53.3%)",
    secondary: "hsl(210 40% 96.1%)",
    accent: "hsl(210 40% 96.1%)",
    muted: "hsl(210 40% 96.1%)",
    destructive: "hsl(0 84.2% 60.2%)",
    border: "hsl(214.3 31.8% 91.4%)",
    input: "hsl(214.3 31.8% 91.4%)",
    ring: "hsl(221.2 83.2% 53.3%)",
  },
  dark: {
    background: "hsl(222.2 84% 4.9%)",
    foreground: "hsl(210 40% 98%)",
    primary: "hsl(217.2 91.2% 59.8%)",
    secondary: "hsl(217.2 32.6% 17.5%)",
    accent: "hsl(217.2 32.6% 17.5%)",
    muted: "hsl(217.2 32.6% 17.5%)",
    destructive: "hsl(0 62.8% 30.6%)",
    border: "hsl(217.2 32.6% 17.5%)",
    input: "hsl(217.2 32.6% 17.5%)",
    ring: "hsl(224.3 76.3% 48%)",
  },
} as const satisfies Record<"light" | "dark", ThemePalette>;

/** Subject accents used by charts and the exam UI. Mirrors `--subject-*` tokens. */
export const SUBJECT_COLORS = {
  Physics: "#0b57a4",
  Chemistry: "#1e9e57",
  Mathematics: "#7a3ec8",
} as const;

export type SubjectName = keyof typeof SUBJECT_COLORS;
