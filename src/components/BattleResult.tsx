import { characterImageVariant } from "../app/assets.js";
import { isImageApprovedForPublicDisplay } from "../app/image-rights.js";
import type {
  BattleReport,
  CharacterProfile,
  ProfileCapability,
  Side,
  Winner
} from "../domain/index.js";
import { CharacterImage } from "./CharacterImage.js";

interface BattleResultProps {
  readonly report: BattleReport;
  readonly shareLabel: string;
  readonly onEdit: () => void;
  readonly onShare: () => void;
}

function profileIdentity(profile: CharacterProfile, fallback: string): string {
  const characterName = profile.character.name.trim().toLocaleLowerCase();
  return profile.names.find((name) =>
    name.trim() && name.trim().toLocaleLowerCase() !== characterName
  )?.trim() || profile.key.name?.trim() || fallback;
}

function combatantLabels(report: BattleReport): {
  readonly left: string;
  readonly right: string;
} {
  const namesCollide = report.left.character.name.localeCompare(
    report.right.character.name,
    undefined,
    { sensitivity: "base" }
  ) === 0;

  if (!namesCollide) {
    return {
      left: report.left.character.name,
      right: report.right.character.name
    };
  }

  const leftIdentity = profileIdentity(report.left, "Fighter 01");
  const rightIdentity = profileIdentity(report.right, "Fighter 02");
  const identitiesCollide = leftIdentity.localeCompare(
    rightIdentity,
    undefined,
    { sensitivity: "base" }
  ) === 0;

  return {
    left: `${report.left.character.name} (${identitiesCollide ? "Fighter 01" : leftIdentity})`,
    right: `${report.right.character.name} (${identitiesCollide ? "Fighter 02" : rightIdentity})`
  };
}

function winnerLabel(
  winner: Winner,
  labels: ReturnType<typeof combatantLabels>
): string {
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
  const image = isImageApprovedForPublicDisplay(profile.image)
    ? profile.image
    : null;
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
          {profile.details.map((detail) => <li key={detail}>{detail}</li>)}
          <li>{profile.stats.length} ranked stats</li>
        </ul>
      </div>
      <div class="combatant-card__image">
        {image ? (
          <CharacterImage
            src={characterImageVariant(image.image, 640)}
            alt={`${label} — ${image.name}`}
          />
        ) : (
          <span class="image-fallback" aria-hidden="true">
            {profile.character.name.charAt(0)}
          </span>
        )}
      </div>
    </article>
  );
}

function CapabilityTag({ capability }: { readonly capability: ProfileCapability }) {
  const status = capability.status;
  const statusCode = status?.code ?? "active";
  const details = [
    ...(status?.reason ? [status.reason] : []),
    ...(capability.details ?? [])
  ];

  return (
    <li class="capability-tag" data-status={statusCode}>
      {details.length > 0 ? (
        <details>
          <summary>
            <strong>{capability.label}</strong>
            <small>
              {status?.label ?? (capability.placeholder ? "Unspecified" : "Active")}
            </small>
          </summary>
          <ul class="capability-tag__details">
            {details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        </details>
      ) : (
        <>
          <strong>{capability.label}</strong>
          <small>
            {status?.label ?? (capability.placeholder ? "Unspecified" : "Active")}
          </small>
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
      <h3>{label} · {side === "left" ? "Fighter 01" : "Fighter 02"}</h3>
      {profile.sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.id}>
            <h3 class="capability-section-title">{section.label}</h3>
            <ul class="capability-list">
              {section.items.map((item, index) => (
                <CapabilityTag
                  capability={item}
                  key={`${section.id}-${item.id}-${index}`}
                />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function relabeledInteractionDetail(
  report: BattleReport,
  labels: ReturnType<typeof combatantLabels>
): string {
  const interaction = report.score.interaction;
  if (!interaction || interaction.winner !== "tie") return interaction?.detail ?? "";

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

function contextualInteractionSummary(
  report: BattleReport,
  labels: ReturnType<typeof combatantLabels>
): string {
  const interaction = report.score.interaction;
  if (!interaction) return "";

  const labelsAreContextual = labels.left !== report.left.character.name
    || labels.right !== report.right.character.name;
  if (
    !labelsAreContextual
    || interaction.winner === "tie"
    || interaction.summary.includes(labels.left)
    || interaction.summary.includes(labels.right)
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

export function BattleResult({
  report,
  shareLabel,
  onEdit,
  onShare
}: BattleResultProps) {
  const { left, right, score, verdict } = report;
  const labels = combatantLabels(report);
  const labelsAreContextual = labels.left !== left.character.name
    || labels.right !== right.character.name;
  const headlineIsContextual = verdict.headline.includes(labels.left)
    || verdict.headline.includes(labels.right);
  const verdictHeadline = !labelsAreContextual || headlineIsContextual
    ? verdict.headline
    : verdict.winner === "left"
      ? `${labels.left} wins`
      : verdict.winner === "right"
        ? `${labels.right} wins`
        : `${labels.left} and ${labels.right} draw`;
  const interactionSummary = contextualInteractionSummary(report, labels);
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
          <h2 class="battle-heading" id="battle-title" tabIndex={-1}>Battle report</h2>
        </div>
        <div class="battle-toolbar__actions">
          <button class="secondary-button" type="button" onClick={onEdit}>
            Edit matchup
          </button>
          <button class="secondary-button" type="button" onClick={onShare}>
            {shareLabel}
          </button>
        </div>
      </header>

      <details class="battle-fold" open>
        <summary>
          <h2>Verdict</h2>
          <small>{verdict.kind} · {resolutionLabel(report.resolution)}</small>
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
      </details>

      <details class="battle-fold" open>
        <summary>
          <h2>Ranked comparison</h2>
          <small>{score.statCount} scored stats · gap {score.scoreGap}</small>
        </summary>
        <div class="comparison-list">
          {report.comparisons.map((comparison) => (
            <div class="comparison-row" key={comparison.id}>
              <div class={`comparison-row__side${comparison.winner === "left" ? " comparison-row__side--winner" : ""}`}>
                <span>{labels.left}</span>
                <strong>{comparison.left?.value ?? "Not ranked"}</strong>
                <small>
                  Rank {comparison.left?.rank ?? 0}
                  {comparison.left?.note ? ` · ${comparison.left.note}` : ""}
                </small>
              </div>
              <div class="comparison-row__label">
                <strong>{comparison.label}</strong>
                <small>
                  {comparison.includedInScore
                    ? comparison.winner === "tie"
                      ? "Even"
                      : `${winnerLabel(comparison.winner, labels)} scores`
                    : "Display only"}
                </small>
              </div>
              <div class={`comparison-row__side${comparison.winner === "right" ? " comparison-row__side--winner" : ""}`}>
                <span>{labels.right}</span>
                <strong>{comparison.right?.value ?? "Not ranked"}</strong>
                <small>
                  Rank {comparison.right?.rank ?? 0}
                  {comparison.right?.note ? ` · ${comparison.right.note}` : ""}
                </small>
              </div>
            </div>
          ))}
        </div>
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
