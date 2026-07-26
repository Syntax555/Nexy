import { assetUrl, characterImageVariant } from "../app/assets.js";
import type { RosterCharacter } from "../app/roster.js";
import type { CharacterProfile as CharacterProfileData } from "../domain/index.js";
import type { DialogImage } from "./ImageDialog.js";
import { CharacterImage } from "./CharacterImage.js";

interface CharacterProfileProps {
  readonly side: "left" | "right";
  readonly rosterCharacter: RosterCharacter | null;
  readonly profile: CharacterProfileData | null;
  readonly onFormChange: (formId: string) => void;
  readonly onOpenImage: (image: DialogImage) => void;
}

function capabilityCount(profile: CharacterProfileData): number {
  return profile.sections.reduce(
    (total, section) => total + section.items.length,
    0
  );
}

export function CharacterProfile({
  side,
  rosterCharacter,
  profile,
  onFormChange,
  onOpenImage
}: CharacterProfileProps) {
  const fighterNumber = side === "left" ? "01" : "02";

  if (!rosterCharacter || !profile) {
    return (
      <div class="fighter-profile fighter-profile--empty">
        <span class="fighter-profile__number" aria-hidden="true">{fighterNumber}</span>
        <strong>No fighter selected</strong>
        <p>Choose someone from the roster to inspect their form, stats, and complete loadout.</p>
      </div>
    );
  }

  const image = profile.image;
  const imageTitle = image
    ? `${profile.character.name} — ${image.name}`
    : profile.character.name;
  const aliases = profile.names.filter((name) => name !== profile.character.name);
  const totalCapabilities = capabilityCount(profile);

  return (
    <article class="fighter-profile">
      <div class="profile-visual">
        {image ? (
          <>
            <CharacterImage
              src={characterImageVariant(image.image, 640)}
              alt={imageTitle}
              loading="eager"
            />
            <button
              class="icon-button profile-visual__expand"
              type="button"
              aria-label={`View full image of ${profile.character.name}`}
              onClick={() => {
                onOpenImage({
                  src: assetUrl(image.image),
                  alt: imageTitle,
                  title: imageTitle
                });
              }}
            >
              +
            </button>
          </>
        ) : (
          <span class="image-fallback" role="img" aria-label="Image unavailable">
            {profile.character.name.charAt(0)}
          </span>
        )}
      </div>

      <div class="profile-content">
        <div class="profile-identity">
          <span class="eyebrow">Fighter {fighterNumber}</span>
          <h3>{profile.character.name}</h3>
          <p>
            {aliases.length > 0
              ? aliases.join(" · ")
              : rosterCharacter.verse}
          </p>
        </div>

        <label class="form-select">
          <span>Combat form</span>
          <select
            value={profile.key.key}
            aria-label={`Form for ${profile.character.name}`}
            onChange={(event) => onFormChange(event.currentTarget.value)}
          >
            {rosterCharacter.character.keys.map((form) => (
              <option value={form.key} key={form.key}>
                {form.name || form.names[0] || form.key}
              </option>
            ))}
          </select>
        </label>

        <ul class="profile-meta" aria-label="Character details">
          <li>{rosterCharacter.verse}</li>
          {profile.details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>

        <ul class="profile-stats" aria-label={`${profile.character.name} statistics`}>
          {profile.stats.map((stat) => (
            <li key={stat.id}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              {stat.note ? <small class="profile-stat__note">{stat.note}</small> : null}
            </li>
          ))}
        </ul>

        {totalCapabilities > 0 ? (
          <details class="profile-details">
            <summary>
              Complete loadout
              <span>{totalCapabilities} entries</span>
            </summary>
            <div class="profile-sections">
              {profile.sections
                .filter((section) => section.items.length > 0)
                .map((section) => (
                  <section key={section.id}>
                    <h4>{section.label}</h4>
                    <ul>
                      {section.items.map((item, index) => (
                        <li key={`${item.kind}-${item.id}-${index}`}>
                          {item.details?.length || item.status?.reason ? (
                            <details class="profile-capability">
                              <summary>
                                <span>{item.label}</span>
                                {item.status && item.status.code !== "active"
                                  ? <small>{item.status.label}</small>
                                  : null}
                              </summary>
                              <ul class="profile-capability__details">
                                {item.status?.reason
                                  ? <li>{item.status.reason}</li>
                                  : null}
                                {item.details?.map((detail) => (
                                  <li key={detail}>{detail}</li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <>
                              {item.label}
                              {item.status && item.status.code !== "active"
                                ? ` — ${item.status.label}`
                                : ""}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
}
