// Visual themes (the palette icon cycles them). Colours feed render.js and CSS
// variables. Choice persists in localStorage.

export const THEMES = {
  cream: {
    name: "Cream",
    bg: "#f4ece0",
    panel: "#fbf6ee",
    dot: "#d9ccb8",
    arrow: "#9b8b73",
    trace: "#d2694e",
    start: "#5aaa78",
    exit: "#d25c48",
    text: "#5a4e40",
    dim: "#968a7a",
  },
  night: {
    name: "Night",
    bg: "#262320",
    panel: "#332e28",
    dot: "#463f36",
    arrow: "#b0a085",
    trace: "#e8865a",
    start: "#5aaa78",
    exit: "#e0674f",
    text: "#e8ddcc",
    dim: "#9a8d7a",
  },
  mint: {
    name: "Mint",
    bg: "#eef4ee",
    panel: "#f7fbf7",
    dot: "#cfe0d2",
    arrow: "#7fa58a",
    trace: "#d2694e",
    start: "#3f9d6b",
    exit: "#d25c48",
    text: "#3d4f44",
    dim: "#7d8f82",
  },
  ocean: {
    name: "Ocean",
    bg: "#eaf1f6",
    panel: "#f5f9fc",
    dot: "#c6d8e6",
    arrow: "#7794ad",
    trace: "#e2663f",
    start: "#2f9bb5",
    exit: "#e2663f",
    text: "#38485a",
    dim: "#7d8ea0",
  },
  rose: {
    name: "Rose",
    bg: "#f7ecef",
    panel: "#fcf5f7",
    dot: "#e6cdd6",
    arrow: "#b3879a",
    trace: "#c7506f",
    start: "#5aaa78",
    exit: "#c7506f",
    text: "#5a4049",
    dim: "#99808a",
  },
};

const ORDER = ["cream", "night", "mint", "ocean", "rose"];
const KEY = "xmaze.theme";

export function currentThemeId() {
  return localStorage.getItem(KEY) || "cream";
}

export function currentTheme() {
  return THEMES[currentThemeId()] || THEMES.cream;
}

export function cycleTheme() {
  const i = ORDER.indexOf(currentThemeId());
  const next = ORDER[(i + 1) % ORDER.length];
  localStorage.setItem(KEY, next);
  applyCssVars(THEMES[next]);
  return THEMES[next];
}

// Push theme colours into CSS custom properties for the surrounding chrome.
export function applyCssVars(theme = currentTheme()) {
  const r = document.documentElement.style;
  r.setProperty("--bg", theme.bg);
  r.setProperty("--panel", theme.panel);
  r.setProperty("--text", theme.text);
  r.setProperty("--dim", theme.dim);
  r.setProperty("--trace", theme.trace);
  r.setProperty("--start", theme.start);
  r.setProperty("--exit", theme.exit);
}
