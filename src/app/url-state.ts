export interface MatchupSelection {
  readonly characterId: string;
  readonly formId: string;
}

export interface MatchupUrlState {
  readonly left: MatchupSelection | null;
  readonly right: MatchupSelection | null;
  readonly showBattle: boolean;
  readonly rulesetVersion?: string | null;
  readonly contentRevision?: string | null;
}

export interface CurrentMatchupVersion {
  readonly rulesetVersion: string;
  readonly contentRevision: string;
}

function parseSelection(value: string | null): MatchupSelection | null {
  if (!value) return null;

  const separator = value.indexOf("~");
  if (separator <= 0 || separator === value.length - 1) return null;

  const characterId = value.slice(0, separator);
  const formId = value.slice(separator + 1);
  if (!characterId || !formId) return null;

  return { characterId, formId };
}

function formatSelection(selection: MatchupSelection | null): string | null {
  return selection ? `${selection.characterId}~${selection.formId}` : null;
}

function parseVersion(value: string | null): string | null {
  return value && value.length <= 80 && /^[a-z0-9._-]+$/i.test(value) ? value : null;
}

export function readMatchupUrl(search: string): MatchupUrlState {
  const parameters = new URLSearchParams(search);

  return {
    left: parseSelection(parameters.get("left")),
    right: parseSelection(parameters.get("right")),
    showBattle: parameters.get("battle") === "1",
    rulesetVersion: parseVersion(parameters.get("ruleset")),
    contentRevision: parseVersion(parameters.get("data"))
  };
}

export function writeMatchupUrl(state: MatchupUrlState): string {
  const parameters = new URLSearchParams();
  const left = formatSelection(state.left);
  const right = formatSelection(state.right);

  if (left) parameters.set("left", left);
  if (right) parameters.set("right", right);
  if (state.showBattle && left && right) parameters.set("battle", "1");
  if ((left || right) && state.rulesetVersion) {
    parameters.set("ruleset", state.rulesetVersion);
  }
  if ((left || right) && state.contentRevision) {
    parameters.set("data", state.contentRevision);
  }

  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export function matchupVersionWarning(state: MatchupUrlState, current: CurrentMatchupVersion): string | null {
  if (!state.left && !state.right && !state.showBattle) return null;
  if (!state.rulesetVersion && !state.contentRevision) {
    return "This legacy matchup link has no ruleset or data revision. Results use the current build.";
  }

  const mismatches: string[] = [];
  if (!state.rulesetVersion) {
    mismatches.push("no ruleset version");
  } else if (state.rulesetVersion !== current.rulesetVersion) {
    mismatches.push(`ruleset ${state.rulesetVersion} instead of ${current.rulesetVersion}`);
  }
  if (!state.contentRevision) {
    mismatches.push("no content revision");
  } else if (state.contentRevision !== current.contentRevision) {
    mismatches.push("an older or unknown content revision");
  }
  if (mismatches.length === 0) return null;
  return `This matchup link targets ${mismatches.join(" and ")}. Results use the current build.`;
}
