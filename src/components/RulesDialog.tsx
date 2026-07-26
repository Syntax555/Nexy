import { useEffect, useRef } from "preact/hooks";

interface RulesDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const rules = [
  {
    number: "01",
    title: "Resolve the loadout",
    body: "Forms, standard equipment, attacks, recursive grants, and stat effects build each complete combat profile."
  },
  {
    number: "02",
    title: "Process counters",
    body: "Resistances, absorption, nullification, and non-physical interaction resolve together until both profiles are stable."
  },
  {
    number: "03",
    title: "Compare ranked stats",
    body: "Attack, speed, strength, durability, stamina, range, and intelligence contribute points. Tier is shown but not counted twice."
  },
  {
    number: "04",
    title: "Break true ties",
    body: "Regeneration is the first tie-breaker, followed by martial arts mastery. Otherwise the matchup is a draw."
  }
] as const;

export function RulesDialog({ open, onClose }: RulesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      class="modal"
      ref={dialogRef}
      aria-labelledby="rules-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) event.currentTarget.close();
      }}
    >
      <div class="modal__panel">
        <header class="modal__header">
          <div>
            <span class="eyebrow">Transparent by design</span>
            <h2 id="rules-title">How Nexy decides</h2>
          </div>
          <button class="icon-button" type="button" aria-label="Close rules" onClick={onClose}>
            ×
          </button>
        </header>
        <div class="rules-grid">
          {rules.map((rule) => (
            <article class="rule-card" key={rule.number}>
              <span>{rule.number}</span>
              <h3>{rule.title}</h3>
              <p>{rule.body}</p>
            </article>
          ))}
        </div>
        <p class="modal__note">
          Nexy is a deterministic comparison model, not a claim about narrative canon.
          Every verdict is only as complete as the entered data.
        </p>
      </div>
    </dialog>
  );
}
