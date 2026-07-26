import type { Theme } from "../app/use-theme.js";

interface ThemeToggleProps {
  readonly theme: Theme;
  readonly onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      class="quiet-button theme-toggle"
      type="button"
      aria-label={`Switch to ${nextTheme} mode`}
      onClick={onToggle}
    >
      <span class="theme-toggle__icon" aria-hidden="true">
        {theme === "dark" ? "☼" : "◐"}
      </span>
      <span>{nextTheme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
