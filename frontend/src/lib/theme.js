export const THEME_STORAGE_KEY = "anotara:theme";
export const THEMES = {
  light: "light",
  dark: "dark",
};

function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return THEMES.light;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? THEMES.dark : THEMES.light;
}

export function getInitialTheme() {
  if (typeof window === "undefined") {
    return THEMES.light;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === THEMES.dark || storedTheme === THEMES.light) {
    return storedTheme;
  }

  return getSystemTheme();
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function persistTheme(theme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}
