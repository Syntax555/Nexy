import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionDock } from "../../src/components/ActionDock.js";

afterEach(cleanup);

describe("ActionDock", () => {
  it("exposes its named controls as an accessible group", () => {
    render(<ActionDock left={null} right={null} onSwap={vi.fn()} onAnalyze={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Matchup controls" })).toBeTruthy();
  });
});
