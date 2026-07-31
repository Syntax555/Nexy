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
const SEARCH_THRESHOLD = 8;

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [optionLimit, setOptionLimit] = useState(MAX_VISIBLE_OPTIONS);
  const listboxId = `${id}-listbox`;
  const countId = `${id}-choice-count`;
  const choices = useMemo<readonly SearchableSelectOption[]>(
    () => [{ id: "all", label: allLabel }, ...options],
    [allLabel, options]
  );
  const isSearchable = options.length > SEARCH_THRESHOLD;
  const searchableChoices = useMemo(
    () =>
      choices.map((option) => ({
        option,
        text: normalizeSearchText(option.label)
      })),
    [choices]
  );
  const queryTokens = useMemo(() => normalizeSearchText(query).split(/\s+/).filter(Boolean), [query]);
  const selected = choices.find((option) => option.id === value) ?? choices[0];
  const filteredChoices = useMemo(
    () =>
      queryTokens.length > 0
        ? searchableChoices
            .filter(({ text }) => queryTokens.every((token) => text.includes(token)))
            .map(({ option }) => option)
        : choices,
    [choices, queryTokens, searchableChoices]
  );
  const orderedChoices = useMemo(() => {
    if (queryTokens.length > 0 || !selected || selected.id === "all") {
      return filteredChoices;
    }
    const selectedIndex = filteredChoices.findIndex((option) => option.id === selected.id);
    return selectedIndex > 0
      ? [selected, ...filteredChoices.filter((option) => option.id !== selected.id)]
      : filteredChoices;
  }, [filteredChoices, queryTokens.length, selected]);
  const shownChoices = orderedChoices.slice(0, optionLimit);
  const remainingChoiceCount = Math.max(0, orderedChoices.length - shownChoices.length);
  const activeChoice = shownChoices[activeIndex];
  const displayValue = disabled ? disabledHint : (selected?.label ?? allLabel);
  const statusText = open
    ? queryTokens.length > 0
      ? filteredChoices.length > shownChoices.length
        ? `Showing ${shownChoices.length} of ${filteredChoices.length} matching choices. Keep typing to narrow the list.`
        : `${filteredChoices.length} matching ${filteredChoices.length === 1 ? "choice" : "choices"}.`
      : filteredChoices.length > shownChoices.length
        ? `Showing ${shownChoices.length} of ${filteredChoices.length} choices. Use search to narrow the list.`
        : `${filteredChoices.length} ${filteredChoices.length === 1 ? "choice" : "choices"} available.`
    : value === "all"
      ? `${choices.length} ${choices.length === 1 ? "choice" : "choices"} available.`
      : `${selected?.label ?? value} selected.`;

  useEffect(() => {
    void query;
    void options;
    void allLabel;
    setActiveIndex(0);
    setOptionLimit(MAX_VISIBLE_OPTIONS);
  }, [query, options, allLabel]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
      setQuery("");
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
    setQuery("");
  }, [disabled]);

  useEffect(() => {
    if (!open || !activeChoice) return;
    const activeOption = document.getElementById(`${id}-option-${activeIndex}`);
    activeOption?.scrollIntoView?.({ block: "nearest" });
  }, [activeChoice, activeIndex, id, open]);

  const focusAfterRender = (target: "listbox" | "search" | "trigger"): void => {
    window.requestAnimationFrame(() => {
      if (target === "listbox") {
        listboxRef.current?.focus({ preventScroll: true });
        return;
      }
      if (target === "search") {
        searchRef.current?.focus({ preventScroll: true });
        return;
      }
      triggerRef.current?.focus({ preventScroll: true });
    });
  };

  const openChoices = (focusTarget?: "listbox" | "search"): void => {
    if (disabled) return;
    setQuery("");
    setOptionLimit(MAX_VISIBLE_OPTIONS);
    setActiveIndex(0);
    if (!open) setOpen(true);
    if (focusTarget) focusAfterRender(focusTarget);
  };

  const choose = (option: SearchableSelectOption): void => {
    onChange(option.id);
    setOpen(false);
    setQuery("");
    focusAfterRender("trigger");
  };

  const closeChoices = (restoreFocus = false): void => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) focusAfterRender("trigger");
  };

  const moveActive = (direction: 1 | -1): void => {
    if (direction === 1 && activeIndex === shownChoices.length - 1 && remainingChoiceCount > 0) {
      setOptionLimit((limit) => Math.min(limit + MAX_VISIBLE_OPTIONS, filteredChoices.length));
      setActiveIndex((current) => current + 1);
      return;
    }

    setActiveIndex((current) => {
      if (shownChoices.length === 0) return 0;
      return (current + direction + shownChoices.length) % shownChoices.length;
    });
  };

  const handleListboxKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeChoices(true);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, shownChoices.length - 1));
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && activeChoice) {
      event.preventDefault();
      choose(activeChoice);
    }
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
        <b class="roster-path__step-number" aria-hidden="true">
          {step}
        </b>
        {label}
      </label>
      <div class="searchable-select__control">
        <button
          ref={triggerRef}
          id={id}
          class="searchable-select__trigger"
          type="button"
          aria-label={`${label}: ${displayValue}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-describedby={[describedBy, countId].filter(Boolean).join(" ")}
          disabled={disabled}
          onClick={() => {
            if (open) {
              closeChoices();
            } else {
              openChoices(isSearchable ? "search" : "listbox");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (!open) return;
              event.preventDefault();
              closeChoices(true);
              return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                openChoices("listbox");
                return;
              }
              moveActive(event.key === "ArrowDown" ? 1 : -1);
              return;
            }

            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!open) {
                openChoices(isSearchable ? "search" : "listbox");
              } else if (activeChoice) {
                choose(activeChoice);
              }
            }
          }}
        >
          <span>{displayValue}</span>
        </button>
        <span class="searchable-select__chevron" aria-hidden="true">
          ⌄
        </span>
        {value !== "all" && !disabled ? (
          <button
            class="searchable-select__clear"
            type="button"
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
            onClick={() => {
              onChange("all");
              setOpen(false);
              setQuery("");
              focusAfterRender("trigger");
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <div class="searchable-select__popover">
          {isSearchable ? (
            <label class="searchable-select__search-wrap">
              <span class="visually-hidden">Search {label} choices</span>
              <input
                ref={searchRef}
                class="searchable-select__search"
                type="search"
                value={query}
                placeholder={`Search ${label.toLocaleLowerCase()}…`}
                autocomplete="off"
                aria-controls={listboxId}
                aria-describedby={countId}
                onInput={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeChoices(true);
                    return;
                  }
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    if (shownChoices.length > 0) {
                      setActiveIndex(event.key === "ArrowDown" ? 0 : shownChoices.length - 1);
                      focusAfterRender("listbox");
                    }
                    return;
                  }
                  if (event.key === "Enter" && activeChoice) {
                    event.preventDefault();
                    focusAfterRender("listbox");
                  }
                }}
              />
            </label>
          ) : null}
          <div
            ref={listboxRef}
            id={listboxId}
            class="searchable-select__list"
            role="listbox"
            aria-label={label}
            aria-activedescendant={activeChoice ? `${id}-option-${activeIndex}` : undefined}
            tabIndex={-1}
            onKeyDown={handleListboxKeyDown}
          >
            {shownChoices.map((option, index) => (
              <div
                id={`${id}-option-${index}`}
                class="searchable-select__option"
                role="option"
                aria-selected={option.id === value}
                tabIndex={-1}
                data-active={index === activeIndex ? "true" : "false"}
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  choose(option);
                }}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {option.id === value ? <b aria-hidden="true">✓</b> : null}
              </div>
            ))}
            {shownChoices.length === 0 ? (
              <div class="searchable-select__empty">No matching choices. Try a shorter search.</div>
            ) : null}
          </div>
          {remainingChoiceCount > 0 ? (
            <button
              class="searchable-select__more"
              type="button"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                closeChoices(true);
              }}
              onClick={() => {
                setOptionLimit((limit) => Math.min(limit + MAX_VISIBLE_OPTIONS, filteredChoices.length));
                if (isSearchable) {
                  searchRef.current?.focus({ preventScroll: true });
                } else {
                  listboxRef.current?.focus({ preventScroll: true });
                }
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
