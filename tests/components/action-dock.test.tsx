import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionDock } from "../../src/components/ActionDock.js";

afterEach(cleanup);

describe("ActionDock", () => {
  it("exposes its named controls as an accessible group", () => {
    render(
      <ActionDock
        left={null}
        right={null}
        mobile={false}
        battleVisible={false}
        onSwap={vi.fn()}
        onAnalyze={vi.fn()}
        onChoose={vi.fn()}
      />
    );

    expect(screen.getByRole("group", { name: "Matchup controls" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /analyze battle/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("turns the mobile primary action into the next selection step", () => {
    const onChoose = vi.fn();
    render(
      <ActionDock
        left={null}
        right={null}
        mobile
        battleVisible={false}
        onSwap={vi.fn()}
        onAnalyze={vi.fn()}
        onChoose={onChoose}
      />
    );

    const action = screen.getByRole("button", { name: /choose fighter 01/i }) as HTMLButtonElement;
    expect(action.disabled).toBe(false);
    fireEvent.click(action);
    expect(onChoose).toHaveBeenCalledWith("left");
  });
});
