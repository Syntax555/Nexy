import type {
  BattleSelection,
  CharacterEntry,
  CharacterForm,
  CharacterProfile,
  ContentSource,
  PowerRef,
  ResistanceRef
} from "../domain/index.js";
import {
  activeEffects,
  activeImage,
  activeItemEffects,
  catalogItemsFromRefs,
  effectiveForm,
  itemRefs,
  powerRefLabel,
  powerRefs,
  powerRefsMeetRequirements,
  resistanceRefLabel,
  resistanceRefs
} from "./capabilities.js";
import { arrayField, booleanField, byId, stringField, type GameContext } from "./context.js";
import { describeItem, describePower, describeResistance } from "./describe.js";
import {
  status,
  type CapabilityItem,
  type EngineView,
  type ProfileSection,
  type ResolvedCatalogItem
} from "./internal.js";
import { statsForForm } from "./rank.js";

function resolvedCharacterId(character: CharacterEntry): string {
  return character.entry_id || character.id || "";
}

function findForm(character: CharacterEntry, requestedId?: string): CharacterForm | undefined {
  return requestedId ? character.keys.find((form) => form.key === requestedId) : character.keys[0];
}

export function resolveSelection(
  context: GameContext,
  selection: BattleSelection
): { readonly character: CharacterEntry; readonly form: CharacterForm } {
  const character = context.charactersById.get(selection.characterId);
  if (!character) {
    throw new Error(`Unknown character selection: ${selection.characterId}`);
  }

  const requestedForm = selection.formId || selection.keyId;
  const form = findForm(character, requestedForm);
  if (!form) {
    throw new Error(`Unknown form selection: ${selection.characterId}~${requestedForm || "(default)"}`);
  }
  return { character, form };
}

function ageText(character: CharacterEntry): string {
  if (character.age.display) return character.age.display;
  if (character.age.value !== null && character.age.value !== undefined) {
    return String(character.age.value);
  }
  return character.age.unknown ? "Unknown" : "";
}

function characterDetails(context: GameContext, character: CharacterEntry): readonly string[] {
  const details: string[] = [];
  const gender = byId(context, "genders", character.gender_id);
  const age = ageText(character);
  if (gender) details.push(`Gender: ${stringField(gender, "name")}`);
  if (age) details.push(`Age: ${age}`);
  character.classification_ids.forEach((id) => {
    const classification = byId(context, "classifications", id);
    if (classification) details.push(stringField(classification, "name"));
  });
  return details;
}

function sourcesForForm(character: CharacterEntry, form: CharacterForm) {
  const sourcesById = new Map(arrayField<ContentSource>(character, "sources").map((source) => [source.id, source]));
  return arrayField<string>(form, "source_ids").flatMap((sourceId) => {
    const source = sourcesById.get(sourceId);
    return source ? [source] : [];
  });
}

function itemStatus(context: GameContext, item: ResolvedCatalogItem, ownedPowers: readonly PowerRef[], reason = "") {
  const requirements = arrayField<PowerRef>(item, "required_power_refs");
  if (requirements.length === 0 || powerRefsMeetRequirements(context, ownedPowers, requirements)) {
    return undefined;
  }

  const names = requirements.map((ref) => powerRefLabel(context, ref));
  return status("disabled", reason || `Missing ${names.join(names.length === 2 ? " and " : ", ")}`);
}

function powerItems(context: GameContext, form: CharacterForm, refs: readonly PowerRef[]): readonly CapabilityItem[] {
  return refs.flatMap((ref) => {
    const power = byId(context, "powers", ref.id);
    if (!power) return [];
    const localPlaceholder = Reflect.get(ref, "placeholder");
    return [
      {
        kind: "power" as const,
        id: ref.id,
        label: powerRefLabel(context, ref),
        placeholder: typeof localPlaceholder === "boolean" ? localPlaceholder : booleanField(power, "placeholder"),
        ref,
        details: describePower(context, form, ref)
      }
    ];
  });
}

function resistanceItems(context: GameContext, refs: readonly ResistanceRef[]): readonly CapabilityItem[] {
  return refs.flatMap((ref) => {
    const resistance = byId(context, "resistances", ref.id);
    if (!resistance) return [];
    return [
      {
        kind: "resistance" as const,
        id: ref.id,
        label: resistanceRefLabel(context, ref),
        placeholder: booleanField(resistance, "placeholder"),
        ref,
        details: describeResistance(context, ref)
      }
    ];
  });
}

function itemCapabilities(
  context: GameContext,
  form: CharacterForm,
  ids: readonly string[],
  refs: readonly Readonly<Record<string, unknown>>[],
  catalogName: "equipment" | "attacks",
  kind: "equipment" | "attack",
  ownedPowers: readonly PowerRef[]
): readonly CapabilityItem[] {
  return catalogItemsFromRefs(context, itemRefs(ids, refs), catalogName).map((item) => {
    const resolvedStatus = itemStatus(context, item, ownedPowers);
    return {
      kind,
      id: item.id,
      label: stringField(item, "name"),
      placeholder: booleanField(item, "placeholder"),
      catalogItem: item,
      details: describeItem(context, item, form),
      ...(item.ref ? { ref: item.ref } : {}),
      ...(resolvedStatus ? { status: resolvedStatus } : {})
    };
  });
}

function profileSections(
  context: GameContext,
  form: CharacterForm,
  resolvedPowers: readonly PowerRef[],
  resolvedResistances: readonly ResistanceRef[]
): readonly ProfileSection[] {
  const powersWithoutItems = powerRefs(context, form, []);
  const standardItems = itemCapabilities(
    context,
    form,
    arrayField<string>(form, "standard_equipment_ids"),
    arrayField<Readonly<Record<string, unknown>>>(form, "standard_equipment_refs"),
    "equipment",
    "equipment",
    powersWithoutItems
  );
  const optionalItems = itemCapabilities(
    context,
    form,
    arrayField<string>(form, "optional_equipment_ids"),
    arrayField<Readonly<Record<string, unknown>>>(form, "optional_equipment_refs"),
    "equipment",
    "equipment",
    powersWithoutItems
  ).map((item) => ({
    ...item,
    status: status("disabled", "Optional equipment is not selected in ruleset v1")
  }));
  const attacks = itemCapabilities(
    context,
    form,
    arrayField<string>(form, "attack_ids"),
    [],
    "attacks",
    "attack",
    powersWithoutItems
  );

  return [
    {
      id: "powers",
      label: "Powers",
      items: powerItems(context, form, resolvedPowers)
    },
    {
      id: "resistances",
      label: "Resistances",
      items: resistanceItems(context, resolvedResistances)
    },
    {
      id: "standard-equipment",
      label: "Standard Equipment",
      items: standardItems
    },
    {
      id: "optional-equipment",
      label: "Optional Equipment",
      items: optionalItems
    },
    {
      id: "attacks",
      label: "Attacks/Techniques",
      items: attacks
    }
  ];
}

export function prepareCharacterProfile(
  context: GameContext,
  character: CharacterEntry,
  form: CharacterForm
): EngineView {
  const itemEffects = activeItemEffects(context, form);
  const resolvedPowers = powerRefs(context, form, itemEffects);
  const effects = activeEffects(context, form, resolvedPowers, itemEffects);
  const effectiveKey = effectiveForm(context, form, resolvedPowers, itemEffects, effects);
  const resolvedResistances = resistanceRefs(context, form, resolvedPowers, itemEffects);
  const image = activeImage(form, effects);

  return {
    character: {
      ...character,
      entry_id: resolvedCharacterId(character)
    },
    key: form,
    effectiveKey,
    itemEffects,
    powerRefs: resolvedPowers,
    resistanceRefs: resolvedResistances,
    effects,
    ...(image ? { image } : {}),
    sources: sourcesForForm(character, form),
    names: [...form.names],
    details: characterDetails(context, character),
    stats: statsForForm(context, effectiveKey),
    sections: profileSections(context, form, resolvedPowers, resolvedResistances)
  };
}

export function getCharacterProfile(context: GameContext, selection: BattleSelection): CharacterProfile {
  const { character, form } = resolveSelection(context, selection);
  return {
    ...prepareCharacterProfile(context, character, form),
    selection: {
      characterId: resolvedCharacterId(character),
      formId: form.key
    }
  };
}

export function isEngineView(profile: CharacterProfile): profile is CharacterProfile & EngineView {
  return profile.sections.every((section) =>
    section.items.every((item) => {
      const value = item as CapabilityItem;
      return value.catalogItem === undefined || typeof value.catalogItem === "object";
    })
  );
}
