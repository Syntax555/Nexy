import { render } from "preact";

import { App } from "./app/App.js";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/battle.css";
import "./styles/mobile-flow.css";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Nexy could not find its application mount point.");
}

try {
  render(<App />, root);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown application error";
  render(
    <main class="main error-state" role="alert">
      <span class="eyebrow">Nexy could not start</span>
      <h1>Something broke before the fight.</h1>
      <p>{message}</p>
      <button class="secondary-button" type="button" onClick={() => window.location.reload()}>
        Reload application
      </button>
    </main>,
    root
  );
}
