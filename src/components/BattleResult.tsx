import { characterImageVariant } from "../app/assets.js";
import { isImageEnabledForPublicDisplay } from "../app/image-rights.js";
import { profileCoverage } from "../app/profile-coverage.js";
import type { BattleReport, CharacterProfile, ProfileCapability, Side, Winner } from "../domain/index.js";
import { ArtworkDisclosure } from "./ArtworkDisclosure.js";
import { CharacterImage } from "./CharacterImage.js";

interface BattleResultProps {
  readonly report: BattleReport;
  readonly shareLabel: string;
  readonly shareStatus?: string;
  readonly onEdit: () => void;
  readonly onShare: () => void;
}

function profileIdentity(profile: CharacterProfile, fallback: string): string {
  const characterName = profile.character.name.trim().toLocaleLowerCase();
  return (
    profile.names.find((name) => name.trim() && name.trim().toLocaleLowerCase() !== characterName)?.trim() ||
    profile.key.name?.trim() ||
    fallback
  );
}

function combatantLabels(report: BattleReport): {
  readonly left: string;
  readonly right: string;
} {
  const namesCollide =
    report.left.character.name.localeCompare(report.right.character.name, undefined, { sensitivity: "base" }) === 0;

  if (!namesCollide) {
    return {
      left: report.left.character.name,
      right: report.right.character.name
    };
  }

  const leftIdentity = profileIdentity(report.left, "Fighter 01");
  const rightIdentity = profileIdentity(report.right, "Fighter 02");
  const identitiesCollide = leftIdentity.localeCompare(rightIdentity, undefined, { sensitivity: "base" }) === 0;

  return {
    left: `${report.left.character.name} (${identitiesCollide ? "Fighter 01" : leftIdentity})`,
    right: `${report.right.character.name} (${identitiesCollide ? "Fighter 02" : rightIdentity})`
  };
}

function winnerLabel(winner: Winner, labels: ReturnType<typeof combatantLabels>): string {
  if (winner === "left") return labels.left;
  if (winner === "right") return labels.right;
  return "Draw";
}

function CombatantCard({
  side,
  profile,
  label
}: {
  readonly side: Side;
  readonly profile: CharacterProfile;
  readonly label: string;
}) {
  const image = isImageEnabledForPublicDisplay(profile.image) ? profile.image : null;
  return (
    <article class="combatant-card">
      <div class="combatant-card__copy">
        <span class="eyebrow">{side === "left" ? "Fighter 01" : "Fighter 02"}</span>
        <h3>{label}</h3>
        <p>
          {profile.names.join(" · ")}
          {profile.key.name ? ` · ${profile.key.name}` : ""}
        </p>
        <ul class="combatant-card__facts">
          {profile.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
          <li>{profile.stats.length} ranked stats</li>
        </ul>
      </div>
      <div class="combatant-card__artwork">
        <div class="combatant-card__image">
          {image ? (
            <CharacterImage src={characterImageVariant(image.image, 640)} alt={`${label} — ${image.name}`} />
          ) : (
            <span class="image-fallback" aria-hidden="true">
              {profile.character.name.charAt(0)}
            </span>
          )}
        </div>
        {image ? <ArtworkDisclosure image={image} /> : null}
      </div>
    </article>
  );
}

function CapabilityTag({ capability }: { readonly capability: ProfileCapability }) {
  const status = capability.status;
  const statusCode = status?.code ?? "active";
  const details = [...(status?.reason ? [status.reason] : []), ...(capability.details ?? [])];

  return (
    <li class="capability-tag" data-status={statusCode}>
      {details.length > 0 ? (
        <details>
          <summary>
            <strong>{capability.label}</strong>
            <small>{status?.label ?? (capability.placeholder ? "Unspecified" : "Active")}</small>
          </summary>
          <ul class="capability-tag__details">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
      ) : (
        <>
          <strong>{capability.label}</strong>
          <small>{status?.label ?? (capability.placeholder ? "Unspecified" : "Active")}</small>
        </>
      )}
    </li>
  );
}

function CapabilityColumn({
  side,
  profile,
  label
}: {
  readonly side: Side;
  readonly profile: CharacterProfile;
  readonly label: string;
}) {
  return (
    <div class="capability-column">
      <h3>
        {label} · {side === "left" ? "Fighter 01" : "Fighter 02"}
      </h3>
      {profile.sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.id}>
            <h3 class="capability-section-title">{section.label}</h3>
            <ul class="capability-list">
              {section.items.map((item, index) => (
                <CapabilityTag capability={item} key={`${section.id}-${item.id}-${index}`} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function relabeledInteractionDetail(report: BattleReport, labels: ReturnType<typeof combatantLabels>): string {
  const interaction = report.score.interaction;
  if (interaction?.winner !== "tie") return interaction?.detail ?? "";

  const parts = interaction.detail.split(";").map((part) => part.trim());
  const leftPart = parts[0];
  const rightPart = parts[1];
  if (!leftPart || !rightPart) return interaction.detail;

  const relabel = (part: string, original: string, label: string): string => {
    if (part.startsWith(`${label} `)) return part;
    if (part.startsWith(`${original} `)) {
      return `${label}${part.slice(original.length)}`;
    }
    return part;
  };

  return [
    relabel(leftPart, report.left.character.name, labels.left),
    relabel(rightPart, report.right.character.name, labels.right),
    ...parts.slice(2)
  ].join("; ");
}

function contextualInteractionSummary(report: BattleReport, labels: ReturnType<typeof combatantLabels>): string {
  const interaction = report.score.interaction;
  if (!interaction) return "";

  const labelsAreContextual =
    labels.left !== report.left.character.name || labels.right !== report.right.character.name;
  if (
    !labelsAreContextual ||
    interaction.winner === "tie" ||
    interaction.summary.includes(labels.left) ||
    interaction.summary.includes(labels.right)
  ) {
    return interaction.summary;
  }

  return interaction.winner === "left"
    ? `${labels.right} cannot affect ${labels.left}`
    : `${labels.left} cannot affect ${labels.right}`;
}

function resolutionLabel(resolution: BattleReport["resolution"]): string {
  const rounds = `${resolution.rounds} round${resolution.rounds === 1 ? "" : "s"}`;
  if (resolution.mode === "cycle-suppressed") {
    return `cycle suppressed after ${rounds}`;
  }
  if (resolution.mode === "safety-limit") {
    return `safety limit after ${rounds}`;
  }
  return `stable in ${rounds}`;
}

function comparisonRank(stat: { readonly rank: number; readonly note?: string } | null): string {
  if (!stat) return "No rank";
  return `Rank ${stat.rank}${stat.note ? ` · ${stat.note}` : ""}`;
}

interface VerdictReason {
  readonly label: string;
  readonly detail: string;
}

function verdictReasons(report: BattleReport, labels: ReturnType<typeof combatantLabels>): readonly VerdictReason[] {
  const { score } = report;
  if (score.interaction) {
    return [
      {
        label: contextualInteractionSummary(report, labels),
        detail: relabeledInteractionDetail(report, labels)
      }
    ];
  }
  if (score.tieBreaker) {
    return [
      {
        label: `${score.tieBreaker.label} breaks the tied ranked score`,
        detail: `${score.tieBreaker.leftValue} vs ${score.tieBreaker.rightValue}`
      }
    ];
  }
  if (score.winner === "tie") {
    return [
      {
        label: "The ranked totals remain level",
        detail: `${score.leftScore} to ${score.rightScore} across ${score.statCount} shared statistics`
      }
    ];
  }

  const winner = score.winner;
  const winnerName = winner === "left" ? labels.left : labels.right;
  return report.comparisons
    .filter(
      (comparison) => comparison.includedInScore && comparison.winner === winner && comparison.left && comparison.right
    )
    .sort(
      (left, right) =>
        Math.abs((right.left?.rank ?? 0) - (right.right?.rank ?? 0)) -
        Math.abs((left.left?.rank ?? 0) - (left.right?.rank ?? 0))
    )
    .slice(0, 3)
    .map((comparison) => {
      const winningStat = winner === "left" ? comparison.left : comparison.right;
      const losingStat = winner === "left" ? comparison.right : comparison.left;
      return {
        label: `${winnerName} leads in ${comparison.label}`,
        detail: `${winningStat?.value ?? "Not ranked"} (rank ${winningStat?.rank ?? 0}) vs ${
          losingStat?.value ?? "Not ranked"
        } (rank ${losingStat?.rank ?? 0})`
      };
    });
}

export function BattleResult({ report, shareLabel, shareStatus = "", onEdit, onShare }: BattleResultProps) {
  const { left, right, score, verdict } = report;
  const labels = combatantLabels(report);
  const labelsAreContextual = labels.left !== left.character.name || labels.right !== right.character.name;
  const headlineIsContextual = verdict.headline.includes(labels.left) || verdict.headline.includes(labels.right);
  const verdictHeadline =
    !labelsAreContextual || headlineIsContextual
      ? verdict.headline
      : verdict.winner === "left"
        ? `${labels.left} wins`
        : verdict.winner === "right"
          ? `${labels.right} wins`
          : `${labels.left} and ${labels.right} draw`;
  const interactionSummary = contextualInteractionSummary(report, labels);
  const reasons = verdictReasons(report, labels);
  const leftCoverage = profileCoverage(left);
  const rightCoverage = profileCoverage(right);
  const decisionDetail = score.interaction
    ? `${interactionSummary}. ${relabeledInteractionDetail(report, labels)}`
    : score.tieBreaker
      ? `${score.tieBreaker.label}: ${score.tieBreaker.leftValue} vs ${score.tieBreaker.rightValue}`
      : score.winner === "tie"
        ? "No deterministic tie-breaker separates the fighters."
        : `${score.scoreGap}-point advantage across ranked statistics.`;

  return (
    <section class="battle-view" id="battle" aria-labelledby="battle-title">
      <header class="battle-toolbar">
        <div class="battle-toolbar__copy">
          <span class="eyebrow">Deterministic ruleset v{report.rulesetVersion}</span>
          <h2 class="battle-heading" id="battle-title" tabIndex={-1}>
            Battle report
          </h2>
        </div>
        <div class="battle-toolbar__actions">
          <button class="secondary-button" type="button" onClick={onEdit}>
            Edit matchup
          </button>
          <button class="secondary-button" type="button" onClick={onShare}>
            {shareLabel}
          </button>
          <span class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {shareStatus}
          </span>
        </div>
      </header>

      <details class="battle-fold" open>
        <summary>
          <h2>Verdict</h2>
          <small>
            {verdict.kind} · {resolutionLabel(report.resolution)}
          </small>
        </summary>
        <div class="verdict">
          <div class="verdict__fighter">
            <span>{verdict.winner === "left" ? "Winner" : "Fighter 01"}</span>
            <strong>{score.leftScore}</strong>
            <small>{labels.left}</small>
          </div>
          <div class="verdict__summary" role="status">
            <span>{verdict.kind.replace("-", " ")}</span>
            <strong>{verdictHeadline}</strong>
            <small>{decisionDetail}</small>
          </div>
          <div class="verdict__fighter">
            <span>{verdict.winner === "right" ? "Winner" : "Fighter 02"}</span>
            <strong>{score.rightScore}</strong>
            <small>{labels.right}</small>
          </div>
        </div>
        <div class="verdict-explanation">
          <h3>Why this result</h3>
          <ol class="verdict-reasons">
            {reasons.map((reason) => (
              <li key={`${reason.label}:${reason.detail}`}>
                <strong>{reason.label}</strong>
                <span>{reason.detail}</span>
              </li>
            ))}
          </ol>
          <p class="battle-coverage">
            Resolved data coverage: {labels.left} {leftCoverage.authored}/{leftCoverage.total}; {labels.right}{" "}
            {rightCoverage.authored}/{rightCoverage.total}. This battle scores {score.statCount} shared ranked fields;
            missing optional values are excluded, never treated as zero.
          </p>
        </div>
      </details>

      <details class="battle-fold">
        <summary>
          <h2>Ranked comparison</h2>
          <small>
            {score.statCount} scored stats · gap {score.scoreGap}
          </small>
        </summary>
        <p class="battle-method">
          Nexy adds each fighter&apos;s catalog rank across the shared scored fields. The higher total wins. If totals
          tie, Regeneration is checked first, followed by Martial Arts Mastery; otherwise the result is a draw.
        </p>
        <table class="comparison-list">
          <caption class="visually-hidden">
            Ranked statistic comparison between {labels.left} and {labels.right}
          </caption>
          <thead class="visually-hidden">
            <tr>
              <th scope="col">{labels.left}</th>
              <th scope="col">Statistic</th>
              <th scope="col">{labels.right}</th>
            </tr>
          </thead>
          <tbody>
            {report.comparisons.map((comparison) => (
              <tr class="comparison-row" key={comparison.id}>
                <td
                  class={`comparison-row__side${comparison.winner === "left" ? " comparison-row__side--winner" : ""}`}
                >
                  <span>{labels.left}</span>
                  <strong>{comparison.left?.value ?? "Not ranked"}</strong>
                  <small>{comparisonRank(comparison.left)}</small>
                </td>
                <th class="comparison-row__label" scope="row">
                  <strong>{comparison.label}</strong>
                  <small>
                    {comparison.includedInScore
                      ? comparison.winner === "tie"
                        ? "Even"
                        : `${winnerLabel(comparison.winner, labels)} scores`
                      : "Display only"}
                  </small>
                </th>
                <td
                  class={`comparison-row__side${comparison.winner === "right" ? " comparison-row__side--winner" : ""}`}
                >
                  <span>{labels.right}</span>
                  <strong>{comparison.right?.value ?? "Not ranked"}</strong>
                  <small>{comparisonRank(comparison.right)}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details class="battle-fold">
        <summary>
          <h2>Combatants</h2>
          <small>Resolved forms and battle state</small>
        </summary>
        <div class="combatant-grid">
          <CombatantCard side="left" profile={left} label={labels.left} />
          <CombatantCard side="right" profile={right} label={labels.right} />
        </div>
      </details>

      <details class="battle-fold">
        <summary>
          <h2>Capabilities and counters</h2>
          <small>{interactionSummary || "All active and suppressed effects"}</small>
        </summary>
        <div class="capability-grid">
          <CapabilityColumn side="left" profile={left} label={labels.left} />
          <CapabilityColumn side="right" profile={right} label={labels.right} />
        </div>
      </details>
    </section>
  );
}
