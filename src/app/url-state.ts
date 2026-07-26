export interface MatchupSelection {
  readonly characterId: string;
  readonly formId: string;
}

export interface MatchupUrlState {
  readonly left: MatchupSelection | null;
  readonly right: MatchupSelection | null;
  readonly showBattle: boolean;
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

export function readMatchupUrl(search: string): MatchupUrlState {
  const parameters = new URLSearchParams(search);

  return {
    left: parseSelection(parameters.get("left")),
    right: parseSelection(parameters.get("right")),
    showBattle: parameters.get("battle") === "1"
  };
}

export function writeMatchupUrl(state: MatchupUrlState): string {
  const parameters = new URLSearchParams();
  const left = formatSelection(state.left);
  const right = formatSelection(state.right);

  if (left) parameters.set("left", left);
  if (right) parameters.set("right", right);
  if (state.showBattle && left && right) parameters.set("battle", "1");

  const query = parameters.toString();
  return query ? `?${query}` : "";
}
