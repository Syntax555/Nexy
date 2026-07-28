import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { normalizeSearchText } from "../search/search.js";

export interface SearchableSelectOption {
  readonly id: string;
  readonly label: string;
}

interface SearchableSelectProps {
  readonly id: string;
  readonly label: string;
  readonly step: number;
  readonly browseStep: "media" | "publisher" | "universe";
  readonly value: string;
  readonly options: readonly SearchableSelectOption[];
  readonly allLabel: string;
  readonly disabled?: boolean;
  readonly disabledHint?: string;
  readonly describedBy?: string;
  readonly onChange: (value: string) => void;
}

const MAX_VISIBLE_OPTIONS = 50;

export function SearchableSelect({
  id,
  label,
  step,
  browseStep,
  value,
  options,
  allLabel,
  disabled = false,
  disabledHint = "Choose the previous step first",
  describedBy,
  onChange
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [optionLimit, setOptionLimit] = useState(MAX_VISIBLE_OPTIONS);
  const listboxId = `${id}-listbox`;
  const countId = `${id}-choice-count`;
  const choices = useMemo<readonly SearchableSelectOption[]>(
    () => [{ id: "all", label: allLabel }, ...options],
    [allLabel, options]
  );
  const searchableChoices = useMemo(
    () => choices.map((option) => ({
      option,
      text: normalizeSearchText(option.label)
    })),
    [choices]
  );
  const queryTokens = useMemo(
    () => normalizeSearchText(query).split(/\s+/).filter(Boolean),
    [query]
  );
  const selected = choices.find((option) => option.id === value) ?? choices[0];
  const filteredChoices = useMemo(
    () => edited
      ? searchableChoices
        .filter(({ text }) => queryTokens.every((token) => text.includes(token)))
        .map(({ option }) => option)
      : choices,
    [choices, edited, queryTokens, searchableChoices]
  );
  const orderedChoices = useMemo(() => {
    if (edited || !selected || selected.id === "all") return filteredChoices;
    const selectedIndex = filteredChoices.findIndex((option) => option.id === selected.id);
    return selectedIndex > 0
      ? [
        selected,
        ...filteredChoices.filter((option) => option.id !== selected.id)
      ]
      : filteredChoices;
  }, [edited, filteredChoices, selected]);
  const shownChoices = orderedChoices.slice(0, optionLimit);
  const remainingChoiceCount = Math.max(0, orderedChoices.length - shownChoices.length);
  const inputValue = open && edited ? query : value === "all" ? "" : selected?.label ?? "";
  const activeChoice = shownChoices[activeIndex];
  const statusText = open
    ? filteredChoices.length > shownChoices.length
      ? `Showing ${shownChoices.length} of ${filteredChoices.length} matching choices. Keep typing to narrow the list.`
      : `${filteredChoices.length} matching ${filteredChoices.length === 1 ? "choice" : "choices"}.`
    : value === "all"
      ? `${choices.length} choices available.`
      : `${selected?.label ?? value} selected.`;

  useEffect(() => {
    setActiveIndex(0);
    setOptionLimit(MAX_VISIBLE_OPTIONS);
  }, [edited, query, options, allLabel]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
      setEdited(false);
      setQuery("");
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
    setEdited(false);
    setQuery("");
  }, [disabled]);

  const openChoices = (): void => {
    if (disabled) return;
    if (open) return;
    setOpen(true);
    setEdited(false);
    setQuery("");
    setOptionLimit(MAX_VISIBLE_OPTIONS);
    const selectedIndex = shownChoices.findIndex((option) => option.id === value);
    setActiveIndex(Math.max(0, selectedIndex));
  };

  const choose = (option: SearchableSelectOption): void => {
    onChange(option.id);
    setOpen(false);
    setEdited(false);
    setQuery("");
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const closeChoices = (): void => {
    setOpen(false);
    setEdited(false);
    setQuery("");
  };

  return (
    <div
      ref={rootRef}
      class="filter-field roster-path__step searchable-select"
      data-browse-step={browseStep}
      data-disabled={disabled ? "true" : "false"}
      onFocusOut={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && rootRef.current?.contains(nextTarget)) return;
        closeChoices();
      }}
    >
      <label for={id}>
        <b class="roster-path__step-number" aria-hidden="true">{step}</b>
        {label}
      </label>
      <div class="searchable-select__control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeChoice
            ? `${id}-option-${activeIndex}`
            : undefined}
          aria-describedby={[describedBy, countId].filter(Boolean).join(" ")}
          autocomplete="off"
          disabled={disabled}
          value={inputValue}
          placeholder={disabled ? disabledHint : allLabel}
          onFocus={(event) => {
            openChoices();
            event.currentTarget.select();
          }}
          onClick={() => {
            if (!open) openChoices();
          }}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setEdited(true);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (!open) return;
              event.preventDefault();
              setOpen(false);
              setEdited(false);
              setQuery("");
              return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                openChoices();
                return;
              }
              const direction = event.key === "ArrowDown" ? 1 : -1;
              if (
                direction === 1
                && activeIndex === shownChoices.length - 1
                && remainingChoiceCount > 0
              ) {
                setOptionLimit((limit) => Math.min(
                  limit + MAX_VISIBLE_OPTIONS,
                  filteredChoices.length
                ));
                setActiveIndex((current) => current + 1);
                return;
              }
              setActiveIndex((current) => {
                if (shownChoices.length === 0) return 0;
                return (current + direction + shownChoices.length) % shownChoices.length;
              });
              return;
            }

            if (event.key === "Home" && open) {
              event.preventDefault();
              setActiveIndex(0);
              return;
            }

            if (event.key === "End" && open) {
              event.preventDefault();
              setActiveIndex(Math.max(0, shownChoices.length - 1));
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              if (!open) {
                openChoices();
              } else if (activeChoice) {
                choose(activeChoice);
              }
            }
          }}
        />
        <span class="searchable-select__chevron" aria-hidden="true">⌄</span>
        {value !== "all" && !disabled ? (
          <button
            class="searchable-select__clear"
            type="button"
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
            onClick={() => {
              onChange("all");
              setOpen(false);
              setEdited(false);
              setQuery("");
              window.requestAnimationFrame(() =>
                inputRef.current?.focus({ preventScroll: true })
              );
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <div class="searchable-select__popover">
          <div id={listboxId} class="searchable-select__list" role="listbox" aria-label={label}>
            {shownChoices.map((option, index) => (
              <div
                id={`${id}-option-${index}`}
                class="searchable-select__option"
                role="option"
                aria-selected={option.id === value}
                data-active={index === activeIndex ? "true" : "false"}
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {option.id === value ? <b aria-hidden="true">✓</b> : null}
              </div>
            ))}
            {shownChoices.length === 0 ? (
              <div class="searchable-select__empty">
                No matching choices. Try a shorter search.
              </div>
            ) : null}
          </div>
          {remainingChoiceCount > 0 ? (
            <button
              class="searchable-select__more"
              type="button"
              onClick={() => {
                setOptionLimit((limit) => Math.min(
                  limit + MAX_VISIBLE_OPTIONS,
                  filteredChoices.length
                ));
                inputRef.current?.focus({ preventScroll: true });
              }}
            >
              Show next {Math.min(MAX_VISIBLE_OPTIONS, remainingChoiceCount)} choices
            </button>
          ) : null}
          <small class="searchable-select__result-count">{statusText}</small>
        </div>
      ) : null}

      <span id={countId} class="visually-hidden" role="status" aria-live="polite">
        {statusText}
      </span>
    </div>
  );
}
