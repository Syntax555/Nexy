import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it } from "vitest";

import { RuntimeErrorBoundary } from "../../src/components/RuntimeErrorBoundary.js";

function FailingChild() {
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error("A later render failed.");

  return (
    <button type="button" onClick={() => setFailed(true)}>
      Trigger failure
    </button>
  );
}

afterEach(cleanup);

describe("RuntimeErrorBoundary", () => {
  it("replaces a child that fails during a later render with a recovery view", () => {
    render(
      <RuntimeErrorBoundary>
        <FailingChild />
      </RuntimeErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger failure" }));

    expect(screen.getByRole("alert").textContent).toContain("A later render failed.");
    expect(
      screen.getByRole("button", {
        name: "Reload application"
      })
    ).toBeTruthy();
  });
});
