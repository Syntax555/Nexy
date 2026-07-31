import { useCallback, useEffect, useState } from "preact/hooks";

export type Theme = "dark" | "light";

function documentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function reflectTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#090b12" : "#f5f3ee");
}

function applyTheme(theme: Theme): void {
  reflectTheme(theme);
  try {
    localStorage.setItem("nexy-theme", theme);
  } catch {
    // A blocked storage API should never prevent theme switching.
  }
}

export function useTheme(): readonly [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(documentTheme);

  useEffect(() => {
    reflectTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  return [theme, toggle] as const;
}
