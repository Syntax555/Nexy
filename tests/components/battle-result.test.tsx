import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BattleResult } from "../../src/components/BattleResult.js";
import { nexyData } from "../../src/data/nexy.js";
import type { BattleReport } from "../../src/domain/index.js";
import { createGameContext, simulateBattle } from "../../src/engine/index.js";

afterEach(() => {
  cleanup();
});

describe("BattleResult", () => {
  it("distinguishes same-name combatants throughout a Falcon matchup", () => {
    const context = createGameContext(nexyData);
    const report = simulateBattle(
      context,
      { characterId: "falcon-marvel-mainstream", formId: "falcon" },
      { characterId: "falcon-sam-wilson-marvel-mainstream", formId: "falcon" }
    );
    const firstComparison = report.comparisons[0];
    if (!firstComparison?.left) {
      throw new Error("Expected a ranked comparison for the Falcon matchup.");
    }
    const comparisonNote = "Only while fully powered";
    const displayedReport: BattleReport = {
      ...report,
      comparisons: report.comparisons.map((comparison, index) =>
        index === 0 && comparison.left
          ? {
              ...comparison,
              left: { ...comparison.left, note: comparisonNote }
            }
          : comparison
      )
    };
    const { container, rerender } = render(
      <BattleResult report={displayedReport} shareLabel="Copy battle link" onEdit={vi.fn()} onShare={vi.fn()} />
    );

    const leftLabel = "Falcon (Joaquín Torres)";
    const rightLabel = "Falcon (Sam Wilson)";
    expect(container.querySelector(".verdict__summary strong")?.textContent).toBe(`${rightLabel} wins`);
    expect([...container.querySelectorAll(".verdict__fighter small")].map((element) => element.textContent)).toEqual([
      leftLabel,
      rightLabel
    ]);
    expect(
      [...container.querySelectorAll(".comparison-row__side > span")].slice(0, 2).map((element) => element.textContent)
    ).toEqual([leftLabel, rightLabel]);
    expect(
      [...container.querySelectorAll(".comparison-row__label small")].some((element) =>
        element.textContent?.includes(`${rightLabel} scores`)
      )
    ).toBe(true);
    expect(container.querySelector(".comparison-row__side small")?.textContent).toBe(
      `Rank ${firstComparison.left.rank} · ${comparisonNote}`
    );
    const comparisonTable = container.querySelector("table.comparison-list");
    expect(comparisonTable?.querySelector("caption")?.textContent).toContain(
      `Ranked statistic comparison between ${leftLabel} and ${rightLabel}`
    );
    expect([...(comparisonTable?.querySelectorAll("thead th") ?? [])].map((heading) => heading.textContent)).toEqual([
      leftLabel,
      "Statistic",
      rightLabel
    ]);
    expect(comparisonTable?.querySelector("tbody th[scope='row']")?.textContent).toContain(firstComparison.label);
    expect([...container.querySelectorAll(".combatant-card h3")].map((element) => element.textContent)).toEqual([
      leftLabel,
      rightLabel
    ]);
    const combatantImages = [...container.querySelectorAll<HTMLImageElement>(".combatant-card__image img")];
    expect(combatantImages.map((image) => image.getAttribute("src"))).toEqual([
      "/images/generated/falcon-marvel-mainstream/falcon-640.webp",
      "/images/generated/falcon-sam-wilson-marvel-mainstream/sam-wilson-640.webp"
    ]);
    expect(combatantImages.map((image) => image.getAttribute("alt"))).toEqual([
      `${leftLabel} \u2014 Falcon`,
      `${rightLabel} \u2014 Falcon`
    ]);
    expect(container.querySelectorAll(".combatant-card__image .image-fallback")).toHaveLength(0);

    const artworkDisclosures = [
      ...container.querySelectorAll<HTMLAnchorElement>(".combatant-card .artwork-disclosure")
    ];
    expect(artworkDisclosures).toHaveLength(2);
    expect(artworkDisclosures.map((disclosure) => disclosure.dataset.rightsStatus)).toEqual([
      "unverified-third-party",
      "unverified-third-party"
    ]);
    expect(artworkDisclosures.map((disclosure) => disclosure.querySelector("small")?.textContent)).toEqual([
      "Rights unverified \u00b7 no image licence claimed",
      "Rights unverified \u00b7 no image licence claimed"
    ]);
    expect([...container.querySelectorAll(".capability-column > h3")].map((element) => element.textContent)).toEqual([
      `${leftLabel} · Fighter 01`,
      `${rightLabel} · Fighter 02`
    ]);

    const ambiguousInteractionReport: BattleReport = {
      ...report,
      score: {
        ...report.score,
        winner: "right",
        interaction: {
          winner: "right",
          summary: "Falcon cannot affect Falcon",
          detail: "Blocked by Intangibility"
        }
      },
      verdict: {
        ...report.verdict,
        winner: "right",
        kind: "automatic",
        headline: "Falcon wins"
      }
    };
    rerender(
      <BattleResult
        report={ambiguousInteractionReport}
        shareLabel="Copy battle link"
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(container.querySelector(".verdict__summary strong")?.textContent).toBe(`${rightLabel} wins`);
    expect(container.querySelector(".verdict__summary small")?.textContent).toBe(
      `${leftLabel} cannot affect ${rightLabel}. Blocked by Intangibility`
    );
    expect(container.querySelectorAll(".battle-fold > summary > small")[3]?.textContent).toBe(
      `${leftLabel} cannot affect ${rightLabel}`
    );

    const contextualMutualBlockReport: BattleReport = {
      ...report,
      score: {
        ...report.score,
        winner: "tie",
        interaction: {
          winner: "tie",
          summary: "Neither combatant can affect the other",
          detail: `${leftLabel} is blocked by Intangibility; ${rightLabel} is blocked by Non-Corporeal`
        }
      },
      verdict: {
        ...report.verdict,
        winner: "tie",
        kind: "stalemate",
        headline: "Draw"
      }
    };
    rerender(
      <BattleResult
        report={contextualMutualBlockReport}
        shareLabel="Copy battle link"
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(container.querySelector(".verdict__summary small")?.textContent).toBe(
      `Neither combatant can affect the other. ${leftLabel} is blocked by Intangibility; ` +
        `${rightLabel} is blocked by Non-Corporeal`
    );

    const cycleSuppressedReport: BattleReport = {
      ...report,
      resolution: { mode: "cycle-suppressed", rounds: 4 }
    };
    rerender(
      <BattleResult report={cycleSuppressedReport} shareLabel="Copy battle link" onEdit={vi.fn()} onShare={vi.fn()} />
    );
    expect(container.querySelector(".battle-fold > summary > small")?.textContent).toBe(
      `${report.verdict.kind} · cycle suppressed after 4 rounds`
    );
  });

  it("describes an absent comparison value without inventing rank zero", () => {
    const context = createGameContext(nexyData);
    const report = simulateBattle(
      context,
      { characterId: "falcon-marvel-mainstream", formId: "falcon" },
      { characterId: "dagger-marvel-mainstream", formId: "dagger" }
    );
    const firstComparison = report.comparisons[0];
    if (!firstComparison) {
      throw new Error("Expected at least one ranked comparison.");
    }
    const displayedReport: BattleReport = {
      ...report,
      comparisons: [{ ...firstComparison, left: null }, ...report.comparisons.slice(1)]
    };
    const { container } = render(
      <BattleResult report={displayedReport} shareLabel="Copy battle link" onEdit={vi.fn()} onShare={vi.fn()} />
    );
    const leftCell = container.querySelector(".comparison-row .comparison-row__side");

    expect(leftCell?.querySelector("strong")?.textContent).toBe("Not ranked");
    expect(leftCell?.querySelector("small")?.textContent).toBe("No rank");
    expect(leftCell?.textContent).not.toContain("Rank 0");
  });

  it("uses side labels when both the character name and identity collide", () => {
    const context = createGameContext(nexyData);
    const selection = {
      characterId: "falcon-marvel-mainstream",
      formId: "falcon"
    };
    const report = simulateBattle(context, selection, selection);
    const { container } = render(
      <BattleResult report={report} shareLabel="Copy battle link" onEdit={vi.fn()} onShare={vi.fn()} />
    );

    expect([...container.querySelectorAll(".verdict__fighter small")].map((element) => element.textContent)).toEqual([
      "Falcon (Fighter 01)",
      "Falcon (Fighter 02)"
    ]);
    expect(
      [...container.querySelectorAll(".comparison-row__side > span")].slice(0, 2).map((element) => element.textContent)
    ).toEqual(["Falcon (Fighter 01)", "Falcon (Fighter 02)"]);
  });
});
