export interface Theme {
  id:     string;
  name:   string;
  icon:   string;
  vars:   Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id:   "dark-cyber",
    name: "Dark Cyber",
    icon: "⚡",
    vars: {
      "--cyan":       "#C9A84C",
      "--cold-cyan":  "#00A844",
      "--deep-space": "#060D06",
      "--card-bg":    "rgba(255,255,255,0.03)",
      "--card-border":"rgba(255,255,255,0.07)",
      "--accent":     "#C9A84C",
      "--positive":   "#C9A84C",
      "--negative":   "#ff5252",
      "--text-muted": "rgba(255,255,255,0.35)",
    },
  },
  {
    id:   "hacker-green",
    name: "Хакер",
    icon: "💚",
    vars: {
      "--cyan":       "#39ff14",
      "--cold-cyan":  "#00c853",
      "--deep-space": "#020d02",
      "--card-bg":    "rgba(57,255,20,0.03)",
      "--card-border":"rgba(57,255,20,0.08)",
      "--accent":     "#39ff14",
      "--positive":   "#69ff47",
      "--negative":   "#ff5252",
      "--text-muted": "rgba(57,255,20,0.35)",
    },
  },
  {
    id:   "inferno",
    name: "Огонь",
    icon: "🔥",
    vars: {
      "--cyan":       "#ff6d00",
      "--cold-cyan":  "#ff9800",
      "--deep-space": "#0f0500",
      "--card-bg":    "rgba(255,109,0,0.04)",
      "--card-border":"rgba(255,109,0,0.1)",
      "--accent":     "#ff6d00",
      "--positive":   "#ffab00",
      "--negative":   "#f44336",
      "--text-muted": "rgba(255,109,0,0.4)",
    },
  },
];

const KEY = "oko-theme";

export function getThemeId(): string {
  return localStorage.getItem(KEY) ?? "dark-cyber";
}

export function setThemeId(id: string) {
  localStorage.setItem(KEY, id);
  applyTheme(id);
}

export function applyTheme(id: string) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

export function initTheme() {
  applyTheme(getThemeId());
}
