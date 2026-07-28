import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "preact/hooks";

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

  it("filters choices and supports keyboard selection and clearing", () => {
    render(<ControlledSelect />);
    const combobox = screen.getByRole("combobox", { name: "Media" });

    fireEvent.focus(combobox);
    expect(screen.getByRole("listbox", { name: "Media" })).toBeTruthy();

    fireEvent.input(combobox, { target: { value: "mov" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Movies");
    expect(screen.getAllByText("1 matching choice.")).toHaveLength(2);

    fireEvent.keyDown(combobox, { key: "Enter" });
    expect((combobox as HTMLInputElement).value).toBe("Movies");
    expect(screen.queryByRole("listbox", { name: "Media" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear Media" }));
    expect((combobox as HTMLInputElement).value).toBe("");
  });

  it("closes on Escape and exposes downstream disabled guidance", () => {
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
    const combobox = screen.getByRole("combobox", { name: "Publisher / origin" });

    fireEvent.focus(combobox);
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.focus(combobox);
    const afterControl = screen.getByRole("button", { name: "After control" });
    fireEvent.focusOut(combobox, { relatedTarget: afterControl });
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

    const disabled = screen.getByRole("combobox", {
      name: "Publisher / origin"
    }) as HTMLInputElement;
    expect(disabled.disabled).toBe(true);
    expect(disabled.placeholder).toBe("Choose media first");
  });

  it("caps a broad menu while reporting the complete result count", () => {
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

    fireEvent.focus(screen.getByRole("combobox", { name: "Universe / verse" }));
    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(
      screen.getAllByText(
        "Showing 50 of 76 matching choices. Keep typing to narrow the list."
      )
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Show next 26 choices" }));
    expect(screen.getAllByRole("option")).toHaveLength(76);
    expect(screen.getAllByText("76 matching choices.")).toHaveLength(2);
  });
});
