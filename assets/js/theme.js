(() => {
  const storageKey = "nexy-theme";
  const root = document.documentElement;
  const toggles = Array.from(document.querySelectorAll("[data-theme-toggle]"));
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

  function storedTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  function updateControls(theme) {
    const isDark = theme === "dark";
    const nextLabel = isDark ? "Light mode" : "Night mode";
    const themeColor = document.querySelector('meta[name="theme-color"]');

    if (themeColor) themeColor.content = isDark ? "#0d1117" : "#f4f7f8";

    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()}`);
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.title = `Switch to ${nextLabel.toLowerCase()}`;
      toggle.querySelector("[data-theme-label]").textContent = nextLabel;
      toggle.querySelector('[data-theme-icon="dark"]').hidden = isDark;
      toggle.querySelector('[data-theme-icon="light"]').hidden = !isDark;
    });
  }

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    updateControls(theme);

    if (!persist) return;

    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // The selected theme still applies when storage is unavailable.
    }
  }

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
  });

  colorScheme.addEventListener?.("change", (event) => {
    if (!storedTheme()) applyTheme(event.matches ? "dark" : "light");
  });

  updateControls(root.dataset.theme === "dark" ? "dark" : "light");
})();
