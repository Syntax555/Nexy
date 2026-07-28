import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchableSelect } from "../../src/components/SearchableSelect.js";

const options = [
  { id: "comics", label: "Comics" },
  { id: "games", label: "Video games" },
  { id: "movies", label: "Movies" }
] as const;

function ControlledSelect() {
  const [value, setValue] = useState("all");
  return (
    <SearchableSelect
      id="test-media"
      label="Media"
      step={1}
      browseStep="media"
      value={value}
      options={options}
      allLabel="All media"
      onChange={setValue}
    />
  );
}

describe("SearchableSelect", () => {
  afterEach(cleanup);

  it("opens a short menu as a complete list and supports selection and clearing", async () => {
    render(<ControlledSelect />);
    const trigger = screen.getByRole("button", { name: "Media: All media" });

    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("searchbox", {
      name: "Search Media choices"
    })).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const listbox = screen.getByRole("listbox", { name: "Media" });
    await waitFor(() => {
      expect(document.activeElement).toBe(listbox);
    });
    expect(
      screen.getAllByRole("option").map((option) =>
        option.textContent?.replace("✓", "")
      )
    ).toEqual(["All media", "Comics", "Video games", "Movies"]);
    expect(screen.queryByRole("searchbox", {
      name: "Search Media choices"
    })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: "Movies" }));
    expect(screen.queryByRole("listbox", { name: "Media" })).toBeNull();
    expect(screen.getByRole("button", { name: "Media: Movies" })).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear Media" }));
    expect(screen.getByRole("button", { name: "Media: All media" })).toBeTruthy();
  });

  it("supports keyboard navigation and restores trigger focus", async () => {
    render(<ControlledSelect />);
    const trigger = screen.getByRole("button", { name: "Media: All media" });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const listbox = screen.getByRole("listbox", { name: "Media" });
    await waitFor(() => {
      expect(document.activeElement).toBe(listbox);
    });

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Media: Comics" })).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });

    fireEvent.keyDown(trigger, { key: " " });
    const reopenedListbox = screen.getByRole("listbox", { name: "Media" });
    await waitFor(() => {
      expect(document.activeElement).toBe(reopenedListbox);
    });
    fireEvent.keyDown(reopenedListbox, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Media" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("closes when focus leaves and exposes downstream disabled guidance", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <>
        <SearchableSelect
          id="test-origin"
          label="Publisher / origin"
          step={2}
          browseStep="publisher"
          value="all"
          options={options}
          allLabel="All publishers"
          onChange={onChange}
        />
        <button type="button">After control</button>
      </>
    );
    const trigger = screen.getByRole("button", {
      name: "Publisher / origin: All publishers"
    });

    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    await waitFor(() => {
      expect(document.activeElement).toBe(listbox);
    });
    const afterControl = screen.getByRole("button", { name: "After control" });
    fireEvent.focusOut(listbox, { relatedTarget: afterControl });
    fireEvent.focus(afterControl);
    expect(screen.queryByRole("listbox")).toBeNull();

    rerender(
      <SearchableSelect
        id="test-origin"
        label="Publisher / origin"
        step={2}
        browseStep="publisher"
        value="all"
        options={[]}
        allLabel="All publishers"
        disabled
        disabledHint="Choose media first"
        onChange={onChange}
      />
    );

    const disabled = screen.getByRole("button", {
      name: "Publisher / origin: Choose media first"
    }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(disabled.textContent).toBe("Choose media first");
  });

  it("adds search only to broad menus and reports the complete result count", async () => {
    const manyOptions = Array.from({ length: 75 }, (_, index) => ({
      id: `option-${index}`,
      label: `Universe ${String(index + 1).padStart(3, "0")}`
    }));
    render(
      <SearchableSelect
        id="test-universe"
        label="Universe / verse"
        step={3}
        browseStep="universe"
        value="all"
        options={manyOptions}
        allLabel="All universes"
        onChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Universe / verse: All universes"
    }));
    const search = screen.getByRole("searchbox", {
      name: "Search Universe / verse choices"
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(search);
    });
    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(
      screen.getAllByText(
        "Showing 50 of 76 choices. Use search to narrow the list."
      )
    ).toHaveLength(2);

    fireEvent.input(search, { target: { value: "Universe 075" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Universe 075");
    expect(screen.getAllByText("1 matching choice.")).toHaveLength(2);

    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("listbox", { name: "Universe / verse" })
      );
    });
    expect(screen.getByRole("listbox", {
      name: "Universe / verse"
    })).toBeTruthy();

    search.focus();
    fireEvent.input(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Show next 26 choices" }));
    expect(screen.getAllByRole("option")).toHaveLength(76);
    expect(screen.getAllByText("76 choices available.")).toHaveLength(2);
  });
});
