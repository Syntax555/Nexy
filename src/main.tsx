import { render } from "preact";

import { App } from "./app/App.js";
import { ApplicationError, RuntimeErrorBoundary } from "./components/RuntimeErrorBoundary.js";
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
  render(
    <RuntimeErrorBoundary>
      <App />
    </RuntimeErrorBoundary>,
    root
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown application error";
  render(<ApplicationError message={message} eyebrow="Nexy could not start" />, root);
}
