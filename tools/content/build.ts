import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";
import type { ZodType } from "zod";

import { CATALOG_NAMES, type CatalogName } from "../../src/domain/catalogs.js";
import { catalogSchemas, characterSchema, type CatalogEntrySource, type CharacterSource } from "./schema.js";

export const catalogNames = CATALOG_NAMES;
export type { CatalogName };

export interface CompiledCharacter extends CharacterSource {
  readonly entry_id: string;
}

export interface CompiledData {
  readonly meta: {
    readonly schema_version: 1;
    readonly content_revision: string;
  };
  readonly characters: readonly CompiledCharacter[];
  readonly options: Readonly<Record<CatalogName, readonly CatalogEntrySource[]>>;
}

export interface CompileOptions {
  readonly root?: string;
  readonly check?: boolean;
  readonly outputPath?: string;
}

export interface CompileResult {
  readonly data: CompiledData;
  readonly json: string;
  readonly characterCount: number;
  readonly formCount: number;
  readonly outputPath: string;
  readonly wroteOutput: boolean;
}

export class ContentValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    const sortedErrors = [...new Set(errors)].sort((left, right) => left.localeCompare(right));
    super(
      `Content validation failed with ${sortedErrors.length} error(s):\n${sortedErrors.map((error) => `- ${error}`).join("\n")}`
    );
    this.name = "ContentValidationError";
    this.errors = sortedErrors;
  }
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDirectory, "../..");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const externalAssetPattern = /^(?:(?:[a-z][a-z0-9+.-]*:)?\/\/|data:)/i;
const publicImagePrefix = "images/characters/";
const supportedLocalImagePattern = /\.(?:avif|jpe?g|png|webp)$/i;

const statCatalogs = {
  attack_potency: "attack_durability_tiers",
  attack_speed: "speed_tiers",
  combat_speed: "speed_tiers",
  reaction_speed: "speed_tiers",
  travel_speed: "speed_tiers",
  flight_speed: "speed_tiers",
  lifting_strength: "lifting_strength_tiers",
  striking_strength: "striking_strength_tiers",
  durability: "attack_durability_tiers",
  stamina: "stamina_tiers",
  range: "range_tiers",
  intelligence: "intelligence_tiers"
} as const satisfies Readonly<Record<string, CatalogName>>;

type StatName = keyof typeof statCatalogs;

const rankedCatalogMinimums = {
  stat_modifiers: 1,
  resistance_levels: 1,
  martial_arts_degrees: 0,
  acrobatics_degrees: 0,
  magic_levels: 1,
  attack_durability_tiers: 1,
  speed_tiers: 1,
  lifting_strength_tiers: 1,
  striking_strength_tiers: 1,
  intelligence_tiers: 1,
  range_tiers: 1,
  stamina_tiers: 1
} as const satisfies Partial<Record<CatalogName, number>>;

const effectFields = new Set([
  "grants",
  "stat_effects",
  "stat_modifier_floor_effects",
  "opponent_stat_swap",
  "power_nullification",
  "absorption",
  "resistance_negation",
  "non_physical_interaction",
  "image_update",
  "nullified_by"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function property(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Reflect.get(record, key);
}

function stringProperty(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = property(record, key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringListKey(value: unknown): string {
  return asArray(value)
    .filter((item): item is string => typeof item === "string")
    .sort((left, right) => left.localeCompare(right))
    .join(",");
}

function logicalPowerRefKey(ref: Readonly<Record<string, unknown>>): string {
  return JSON.stringify([
    stringProperty(ref, "id") ?? "",
    stringProperty(ref, "source_variant") ?? "",
    stringListKey(property(ref, "type_ids")),
    stringListKey(property(ref, "magic_nature_ids")),
    stringProperty(ref, "condition") ?? ""
  ]);
}

function normalizeImagePath(value: string): string {
  return value.replace(/^\/+/, "");
}

function normalizeImages(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeImages(item));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "image" && typeof item === "string" && !externalAssetPattern.test(item)
        ? normalizeImagePath(item)
        : normalizeImages(item)
    ])
  );
}

function issuePath(parts: readonly PropertyKey[]): string {
  if (parts.length === 0) return "";

  return parts.map((part) => (typeof part === "number" ? `[${part}]` : `.${String(part)}`)).join("");
}

async function parseYamlFile<T>(
  absolutePath: string,
  root: string,
  schema: ZodType<T>,
  errors: string[]
): Promise<T | undefined> {
  const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
  const source = await readFile(absolutePath, "utf8");
  const document = parseDocument(source, {
    merge: false,
    schema: "core",
    strict: true,
    uniqueKeys: true
  });

  if (document.errors.length > 0) {
    for (const error of document.errors) {
      const line = error.linePos?.[0]?.line;
      errors.push(`${relativePath}${line ? `:${line}` : ""}: ${error.message}`);
    }
    return undefined;
  }

  let rawValue: unknown;
  try {
    rawValue = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    errors.push(
      `${relativePath}: YAML aliases are not allowed (${error instanceof Error ? error.message : String(error)})`
    );
    return undefined;
  }

  const normalizedValue = normalizeImages(rawValue);
  const result = schema.safeParse(normalizedValue);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${relativePath}${issuePath(issue.path)}: ${issue.message}`);
    }
    return undefined;
  }

  // Schemas intentionally contain no transforms. Returning the validated source
  // preserves author-defined key order, keeping generated JSON stable.
  return normalizedValue as T;
}

async function yamlFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

class SemanticValidator {
  readonly errors: string[] = [];
  readonly #root: string;
  readonly #options: Readonly<Record<CatalogName, readonly CatalogEntrySource[]>>;
  readonly #idSets: Readonly<Record<CatalogName, ReadonlySet<string>>>;
  readonly #powerVariants: ReadonlyMap<string, ReadonlySet<string>>;
  readonly #powerTypeOwners: ReadonlyMap<string, string>;

  constructor(root: string, options: Readonly<Record<CatalogName, readonly CatalogEntrySource[]>>) {
    this.#root = root;
    this.#options = options;
    const idSets: Partial<Record<CatalogName, ReadonlySet<string>>> = {};
    for (const name of catalogNames) {
      idSets[name] = new Set(options[name].map((entry) => entry.id));
    }
    this.#idSets = idSets as Record<CatalogName, ReadonlySet<string>>;
    this.#powerVariants = new Map(
      options.powers.map((power) => [
        power.id,
        new Set(
          asArray(property(power, "variants"))
            .filter(isRecord)
            .map((variant) => stringProperty(variant, "id"))
            .filter((id): id is string => Boolean(id))
        )
      ])
    );
    this.#powerTypeOwners = new Map(
      options.power_types.flatMap((entry) => {
        const owner = stringProperty(entry, "power_id");
        return owner ? [[entry.id, owner] as const] : [];
      })
    );
  }

  validateCatalogs(): void {
    for (const name of catalogNames) {
      const entries = this.#options[name];
      const seen = new Map<string, number>();

      entries.forEach((entry, index) => {
        const previous = seen.get(entry.id);
        if (previous !== undefined) {
          this.errors.push(
            `content/catalogs/${name}.yaml[${index}].id: duplicate ${entry.id}; first used at index ${previous}`
          );
        } else {
          seen.set(entry.id, index);
        }
      });
    }

    for (const [name, minimum] of Object.entries(rankedCatalogMinimums) as [
      keyof typeof rankedCatalogMinimums,
      number
    ][]) {
      this.#validateRankContinuity(name, minimum, "rank");
    }
    this.#validateRankContinuity("ability_modifiers", 1, "coverage_rank");

    this.#options.origins.forEach((entry, index) => {
      this.#checkRef(`options.origins[${index}].media_id`, property(entry, "media_id"), "media");
    });
    this.#options.verses.forEach((entry, index) => {
      this.#checkRef(`options.verses[${index}].media_id`, property(entry, "media_id"), "media");
      this.#checkRef(`options.verses[${index}].source_id`, property(entry, "source_id"), "origins");
      const sourceId = stringProperty(entry, "source_id");
      const verseMediaId = stringProperty(entry, "media_id");
      const origin = sourceId ? this.#options.origins.find((candidate) => candidate.id === sourceId) : undefined;
      const originMediaId = origin ? stringProperty(origin, "media_id") : undefined;
      if (sourceId && verseMediaId && originMediaId && verseMediaId !== originMediaId) {
        this.errors.push(
          `options.verses[${index}].media_id: ${JSON.stringify(verseMediaId)} must match ` +
            `origin ${JSON.stringify(sourceId)} media_id ${JSON.stringify(originMediaId)}`
        );
      }
    });
    this.#options.classifications.forEach((entry, index) => {
      this.#checkRefList(
        `options.classifications[${index}].parent_ids`,
        property(entry, "parent_ids"),
        "classifications"
      );
    });
    this.#options.power_types.forEach((entry, index) => {
      this.#checkRef(`options.power_types[${index}].power_id`, property(entry, "power_id"), "powers", true);
      this.#checkRefList(
        `options.power_types[${index}].covers_type_ids`,
        property(entry, "covers_type_ids"),
        "power_types"
      );
      const owner = stringProperty(entry, "power_id");
      for (const coveredId of asArray(property(entry, "covers_type_ids"))) {
        if (typeof coveredId !== "string" || !owner) continue;
        const coveredOwner = this.#powerTypeOwners.get(coveredId);
        if (coveredOwner && coveredOwner !== owner) {
          this.errors.push(
            `options.power_types[${index}].covers_type_ids: ${coveredId} belongs to ` + `${coveredOwner}, not ${owner}`
          );
        }
      }
    });
    this.#options.derived_power_rules.forEach((entry, index) => {
      const context = `options.derived_power_rules[${index}]`;
      this.#checkRef(`${context}.power_id`, property(entry, "power_id"), "powers");
      const evaluationStage = property(entry, "evaluation_stage");
      if (evaluationStage === null || evaluationStage === undefined) {
        this.errors.push(`${context}.evaluation_stage: must be explicitly set to base for ruleset v1`);
      } else if (evaluationStage === "effective") {
        this.errors.push(
          `${context}.evaluation_stage: effective derived-power evaluation is not supported by ruleset v1`
        );
      }
      const requirements = this.#expectArray(`${context}.requirements`, property(entry, "requirements"));
      const minimumMatches = property(entry, "min_matches");
      if (
        typeof minimumMatches === "number" &&
        Number.isInteger(minimumMatches) &&
        minimumMatches > requirements.length
      ) {
        this.errors.push(
          `${context}.min_matches: ${minimumMatches} cannot exceed requirements.length (${requirements.length})`
        );
      }
      requirements.forEach((requirement, requirementIndex) => {
        if (!isRecord(requirement)) {
          this.errors.push(`${context}.requirements[${requirementIndex}]: must be an object`);
          return;
        }
        const requirementContext = `${context}.requirements[${requirementIndex}]`;
        const statName = stringProperty(requirement, "stat");
        if (!statName || !(statName in statCatalogs)) {
          this.errors.push(`${requirementContext}.stat: unknown ranked stat ${JSON.stringify(statName)}`);
          return;
        }
        this.#validateRankedStat(
          requirementContext,
          {
            value: property(requirement, "value"),
            modifier: property(requirement, "modifier")
          },
          statName as StatName
        );
      });
    });

    this.#options.powers.forEach((entry, index) => {
      const context = `options.powers[${index}]`;
      this.#checkRefList(`${context}.type_ids`, property(entry, "type_ids"), "power_types");
      this.#checkDegreeList(`${context}.degree_ids`, property(entry, "degree_ids"));
      this.#validateGrants(`${context}.grants`, property(entry, "grants"));
      this.#validateEffects(`${context}.effects`, property(entry, "effects"));

      const seenVariants = new Set<string>();
      this.#expectArray(`${context}.variants`, property(entry, "variants")).forEach((variant, variantIndex) => {
        const variantContext = `${context}.variants[${variantIndex}]`;
        if (!isRecord(variant)) {
          this.errors.push(`${variantContext}: must be an object`);
          return;
        }
        const variantId = stringProperty(variant, "id");
        if (!variantId) {
          this.errors.push(`${variantContext}.id: must be present`);
        } else if (seenVariants.has(variantId)) {
          this.errors.push(`${variantContext}.id: duplicate power variant ${variantId}`);
        } else {
          seenVariants.add(variantId);
        }
        this.#validateGrants(`${variantContext}.grants`, property(variant, "grants"));
        this.#validateEffects(`${variantContext}.effects`, property(variant, "effects"));
      });
    });

    this.#options.resistances.forEach((entry, index) => {
      const context = `options.resistances[${index}]`;
      this.#checkRefList(`${context}.resists_power_ids`, property(entry, "resists_power_ids"), "powers");
      const effectIds = this.#expectArray(`${context}.resists_effect_ids`, property(entry, "resists_effect_ids"));
      if (effectIds.length > 0) {
        this.errors.push(`${context}.resists_effect_ids: effect-id resistance is not supported by ruleset v1`);
      }
      this.#checkRefList(
        `${context}.resists_weapon_type_ids`,
        property(entry, "resists_weapon_type_ids"),
        "power_types"
      );
    });

    this.#options.magic_levels.forEach((entry, index) => {
      const context = `options.magic_levels[${index}]`;
      this.#checkRefList(`${context}.inherits_level_ids`, property(entry, "inherits_level_ids"), "magic_levels");
      this.#validatePowerRefs(`${context}.power_refs`, property(entry, "power_refs"));
      this.#validateResistanceRefs(`${context}.resistance_refs`, property(entry, "resistance_refs"));
    });
    this.#options.magic_natures.forEach((entry, index) => {
      const context = `options.magic_natures[${index}]`;
      this.#checkRefList(`${context}.inherits_nature_ids`, property(entry, "inherits_nature_ids"), "magic_natures");
      this.#validatePowerRefs(`${context}.power_refs`, property(entry, "power_refs"));
      this.#validateResistanceRefs(`${context}.resistance_refs`, property(entry, "resistance_refs"));
      this.#validateEffects(`${context}.effects`, property(entry, "effects"));
    });

    for (const name of ["equipment", "attacks"] as const) {
      this.#options[name].forEach((entry, index) => {
        const context = `options.${name}[${index}]`;
        this.#checkRefList(`${context}.weapon_type_ids`, property(entry, "weapon_type_ids"), "power_types");
        this.#validatePowerRefs(`${context}.required_power_refs`, property(entry, "required_power_refs"));
        this.#validateEffects(`${context}.effects`, property(entry, "effects"));
      });
    }
  }

  validateCharacter(character: CompiledCharacter, characterIndex: number): void {
    const context = `characters[${characterIndex}](${character.entry_id})`;
    this.#checkRef(`${context}.verse_id`, character.verse_id, "verses");
    this.#checkRef(`${context}.gender_id`, character.gender_id, "genders");
    this.#checkRefList(`${context}.classification_ids`, character.classification_ids, "classifications");

    if (character.age.unknown && character.age.value !== null && character.age.value !== undefined) {
      this.errors.push(`${context}.age: cannot contain a value while unknown is true`);
    }

    const sourceIds = new Set<string>();
    character.sources.forEach((source, sourceIndex) => {
      const sourceContext = `${context}.sources[${sourceIndex}].id`;
      if (sourceIds.has(source.id)) {
        this.errors.push(`${sourceContext}: duplicate character source id ${source.id}`);
      }
      sourceIds.add(source.id);
    });

    const seenForms = new Set<string>();
    character.keys.forEach((form, formIndex) => {
      const formContext = `${context}.keys[${formIndex}]`;
      if (seenForms.has(form.key)) {
        this.errors.push(`${formContext}.key: duplicate form id ${form.key}`);
      }
      seenForms.add(form.key);

      const seenFormSourceIds = new Set<string>();
      form.source_ids.forEach((sourceId, sourceIndex) => {
        const sourceContext = `${formContext}.source_ids[${sourceIndex}]`;
        if (seenFormSourceIds.has(sourceId)) {
          this.errors.push(`${sourceContext}: duplicate source id ${sourceId}`);
        } else if (!sourceIds.has(sourceId)) {
          this.errors.push(`${sourceContext}: unknown character source id ${JSON.stringify(sourceId)}`);
        }
        seenFormSourceIds.add(sourceId);
      });

      form.images.forEach((image, imageIndex) => {
        this.#validateImage(
          `${formContext}.images[${imageIndex}].image`,
          image.image,
          character.entry_id,
          image.rights_status === "unverified-third-party" && image.publish_unverified !== true
        );
      });
      this.#validatePowerRefs(`${formContext}.power_refs`, form.power_refs);
      this.#validateResistanceRefs(`${formContext}.resistance_refs`, form.resistance_refs);
      this.#checkRefList(`${formContext}.standard_equipment_ids`, form.standard_equipment_ids, "equipment");
      this.#validateEquipmentRefs(`${formContext}.standard_equipment_refs`, form.standard_equipment_refs);
      this.#checkRefList(`${formContext}.optional_equipment_ids`, form.optional_equipment_ids, "equipment");
      this.#validateEquipmentRefs(`${formContext}.optional_equipment_refs`, form.optional_equipment_refs);
      this.#checkRefList(`${formContext}.attack_ids`, form.attack_ids, "attacks");

      for (const statName of Object.keys(statCatalogs) as StatName[]) {
        this.#validateRankedStat(formContext, Reflect.get(form, statName), statName);
      }
    });
  }

  async validateCatalogImages(): Promise<void> {
    const visit = (value: unknown, context: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          visit(item, `${context}[${index}]`);
        });
        return;
      }
      if (!isRecord(value)) return;

      const allowMissing =
        property(value, "rights_status") === "unverified-third-party" && property(value, "publish_unverified") !== true;
      for (const [key, item] of Object.entries(value)) {
        const itemContext = `${context}.${key}`;
        if (key === "image" && typeof item === "string") {
          this.#validateImage(itemContext, item, undefined, allowMissing);
        } else {
          visit(item, itemContext);
        }
      }
    };

    for (const name of catalogNames) visit(this.#options[name], `options.${name}`);
    await Promise.resolve();
  }

  #validateRankContinuity(name: CatalogName, minimum: number, field: string): void {
    const ranks = new Map<number, string>();
    this.#options[name].forEach((entry, index) => {
      const rank = property(entry, field);
      if (!Number.isInteger(rank) || Number(rank) < minimum) {
        this.errors.push(`options.${name}[${index}].${field}: must be an integer greater than or equal to ${minimum}`);
        return;
      }
      const numericRank = Number(rank);
      const previous = ranks.get(numericRank);
      if (previous) {
        this.errors.push(`options.${name}[${index}].${field}: rank ${numericRank} is already used by ${previous}`);
      } else {
        ranks.set(numericRank, entry.id);
      }
    });

    if (ranks.size === this.#options[name].length) {
      const actual = [...ranks.keys()].sort((left, right) => left - right);
      const expected = Array.from({ length: actual.length }, (_, index) => minimum + index);
      if (actual.some((rank, index) => rank !== expected[index])) {
        this.errors.push(
          `options.${name}.${field}: values must be contiguous ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
      }
    }
  }

  #checkRef(context: string, value: unknown, catalogName: CatalogName, optional = false): void {
    if (value === null || value === undefined || value === "") {
      if (!optional) this.errors.push(`${context}: must reference an entry in ${catalogName}`);
      return;
    }
    if (typeof value !== "string") {
      this.errors.push(`${context}: must be a string reference to ${catalogName}`);
      return;
    }
    if (!this.#idSets[catalogName].has(value)) {
      this.errors.push(`${context}: unknown ${catalogName} id ${JSON.stringify(value)}`);
    }
  }

  #checkRefList(context: string, value: unknown, catalogName: CatalogName): void {
    if (value === null || value === undefined) return;
    this.#expectArray(context, value).forEach((item, index) => {
      this.#checkRef(`${context}[${index}]`, item, catalogName);
    });
  }

  #checkDegreeList(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    this.#expectArray(context, value).forEach((item, index) => {
      if (
        typeof item !== "string" ||
        (!this.#idSets.martial_arts_degrees.has(item) && !this.#idSets.acrobatics_degrees.has(item))
      ) {
        this.errors.push(`${context}[${index}]: unknown martial arts or acrobatics degree ${JSON.stringify(item)}`);
      }
    });
  }

  #expectArray(context: string, value: unknown): readonly unknown[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      this.errors.push(`${context}: must be an array`);
      return [];
    }
    return value;
  }

  #validateRankedStat(context: string, value: unknown, statName: StatName): void {
    if (value === null || value === undefined) {
      if (!["attack_speed", "reaction_speed", "travel_speed", "flight_speed"].includes(statName)) {
        this.errors.push(`${context}.${statName}: must be present`);
      }
      return;
    }

    let tier: unknown = value;
    let modifier: unknown = "normal";
    if (isRecord(value)) {
      tier = property(value, "value");
      modifier = property(value, "modifier") ?? "normal";
    }
    this.#checkRef(`${context}.${statName}.value`, tier, statCatalogs[statName]);
    this.#checkRef(`${context}.${statName}.modifier`, modifier, "stat_modifiers");

    if (typeof tier === "string" && modifier !== "normal") {
      const tierEntry = this.#options[statCatalogs[statName]].find((entry) => entry.id === tier);
      if (tierEntry && property(tierEntry, "modifier_behavior") === "locked_to_normal") {
        this.errors.push(`${context}.${statName}.modifier: ${tier} is locked to normal`);
      }
    }
  }

  #validatePowerRefs(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    const seen = new Map<string, number>();
    this.#expectArray(context, value).forEach((item, index) => {
      const refContext = `${context}[${index}]`;
      if (!isRecord(item)) {
        this.errors.push(`${refContext}: must be an object`);
        return;
      }
      const powerId = stringProperty(item, "id");
      const key = logicalPowerRefKey(item);
      const previous = seen.get(key);
      if (previous !== undefined) {
        this.errors.push(`${refContext}: duplicate power capability scope; first used at ${context}[${previous}]`);
      } else {
        seen.set(key, index);
      }
      this.#checkRef(`${refContext}.id`, powerId, "powers");
      this.#checkRef(`${refContext}.modifier`, property(item, "modifier") ?? "normal", "ability_modifiers");
      this.#checkRefList(`${refContext}.type_ids`, property(item, "type_ids"), "power_types");
      this.#checkRef(
        `${refContext}.martial_arts_degree_id`,
        property(item, "martial_arts_degree_id"),
        "martial_arts_degrees",
        true
      );
      this.#checkRef(
        `${refContext}.acrobatics_degree_id`,
        property(item, "acrobatics_degree_id"),
        "acrobatics_degrees",
        true
      );
      this.#checkRef(`${refContext}.magic_level_id`, property(item, "magic_level_id"), "magic_levels", true);
      this.#checkRefList(`${refContext}.magic_nature_ids`, property(item, "magic_nature_ids"), "magic_natures");

      const sourceVariant = property(item, "source_variant");
      if (sourceVariant !== null && sourceVariant !== undefined) {
        if (typeof sourceVariant !== "string" || !powerId || !this.#powerVariants.get(powerId)?.has(sourceVariant)) {
          this.errors.push(
            `${refContext}.source_variant: unknown variant ${JSON.stringify(sourceVariant)} for power ${JSON.stringify(powerId)}`
          );
        }
      }

      for (const typeId of asArray(property(item, "type_ids"))) {
        if (typeof typeId !== "string" || !powerId) continue;
        const owner = this.#powerTypeOwners.get(typeId);
        if (owner && owner !== powerId) {
          this.errors.push(`${refContext}.type_ids: ${typeId} belongs to ${owner}, not ${powerId}`);
        }
      }
      this.#validateEffects(`${refContext}.effects`, property(item, "effects"));
    });
  }

  #validateResistanceRefs(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    this.#expectArray(context, value).forEach((item, index) => {
      const refContext = `${context}[${index}]`;
      if (!isRecord(item)) {
        this.errors.push(`${refContext}: must be an object`);
        return;
      }
      this.#checkRef(`${refContext}.id`, property(item, "id"), "resistances");
      this.#checkRef(`${refContext}.level`, property(item, "level") ?? "resistant", "resistance_levels");
      this.#checkRef(`${refContext}.modifier`, property(item, "modifier") ?? "normal", "ability_modifiers");
      this.#checkRefList(`${refContext}.type_ids`, property(item, "type_ids"), "power_types");
      this.#checkRef(`${refContext}.magic_level_id`, property(item, "magic_level_id"), "magic_levels", true);
      this.#checkRefList(`${refContext}.magic_nature_ids`, property(item, "magic_nature_ids"), "magic_natures");
    });
  }

  #validateEquipmentRefs(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    this.#expectArray(context, value).forEach((item, index) => {
      const refContext = `${context}[${index}]`;
      if (!isRecord(item)) {
        this.errors.push(`${refContext}: must be an object`);
        return;
      }
      this.#checkRef(`${refContext}.id`, property(item, "id"), "equipment");
      this.#validateEffects(`${refContext}.effects`, property(item, "effects"));
    });
  }

  #validateGrants(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    if (!isRecord(value)) {
      this.errors.push(`${context}: must be an object`);
      return;
    }
    this.#validatePowerRefs(`${context}.power_refs`, property(value, "power_refs"));
    this.#validateResistanceRefs(`${context}.resistance_refs`, property(value, "resistance_refs"));
    this.#checkRefList(`${context}.magic_level_ids`, property(value, "magic_level_ids"), "magic_levels");
  }

  #validatePowerTargets(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    this.#expectArray(context, value).forEach((item, index) => {
      const refContext = `${context}[${index}]`;
      if (!isRecord(item)) {
        this.errors.push(`${refContext}: must be an object`);
        return;
      }
      const powerId = stringProperty(item, "id");
      this.#checkRef(`${refContext}.id`, powerId, "powers");
      this.#checkRefList(`${refContext}.type_ids`, property(item, "type_ids"), "power_types");
      this.#checkRef(`${refContext}.magic_level_id`, property(item, "magic_level_id"), "magic_levels", true);

      const sourceVariant = property(item, "source_variant");
      if (sourceVariant !== null && sourceVariant !== undefined) {
        if (typeof sourceVariant !== "string" || !powerId || !this.#powerVariants.get(powerId)?.has(sourceVariant)) {
          this.errors.push(
            `${refContext}.source_variant: unknown variant ${JSON.stringify(sourceVariant)} for power ${JSON.stringify(powerId)}`
          );
        }
      }

      for (const typeId of asArray(property(item, "type_ids"))) {
        if (typeof typeId !== "string" || !powerId) continue;
        const owner = this.#powerTypeOwners.get(typeId);
        if (owner && owner !== powerId) {
          this.errors.push(`${refContext}.type_ids: ${typeId} belongs to ${owner}, not ${powerId}`);
        }
      }
    });
  }

  #validateEffects(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    this.#expectArray(context, value).forEach((effect, index) => {
      const effectContext = `${context}[${index}]`;
      if (!isRecord(effect)) {
        this.errors.push(`${effectContext}: must be an object`);
        return;
      }
      if (Object.keys(effect).length === 0) {
        this.errors.push(`${effectContext}: must not be empty`);
      }
      for (const field of Object.keys(effect)) {
        if (!effectFields.has(field)) {
          this.errors.push(`${effectContext}.${field}: unsupported effect field`);
        }
      }

      this.#validateGrants(`${effectContext}.grants`, property(effect, "grants"));

      const statEffects = property(effect, "stat_effects");
      if (statEffects !== null && statEffects !== undefined) {
        if (!isRecord(statEffects)) {
          this.errors.push(`${effectContext}.stat_effects: must be an object`);
        } else {
          for (const [statName, statValue] of Object.entries(statEffects)) {
            if (!(statName in statCatalogs)) {
              this.errors.push(`${effectContext}.stat_effects.${statName}: unknown ranked stat`);
            } else {
              this.#validateRankedStat(`${effectContext}.stat_effects`, statValue, statName as StatName);
            }
          }
        }
      }

      const modifierFloors = property(effect, "stat_modifier_floor_effects");
      if (modifierFloors !== null && modifierFloors !== undefined) {
        this.#expectArray(`${effectContext}.stat_modifier_floor_effects`, modifierFloors).forEach(
          (floor, floorIndex) => {
            const floorContext = `${effectContext}.stat_modifier_floor_effects[${floorIndex}]`;
            if (!isRecord(floor)) {
              this.errors.push(`${floorContext}: must be an object`);
              return;
            }
            const statName = stringProperty(floor, "stat");
            if (!statName || !(statName in statCatalogs)) {
              this.errors.push(`${floorContext}.stat: unknown ranked stat ${JSON.stringify(statName)}`);
            }
            this.#checkRef(`${floorContext}.modifier`, property(floor, "modifier"), "stat_modifiers");
          }
        );
      }

      const swap = property(effect, "opponent_stat_swap");
      if (swap !== null && swap !== undefined) {
        if (!isRecord(swap)) {
          this.errors.push(`${effectContext}.opponent_stat_swap: must be an object`);
        } else {
          const statNames = this.#expectArray(
            `${effectContext}.opponent_stat_swap.stat_names`,
            property(swap, "stat_names")
          );
          statNames.forEach((statName, statIndex) => {
            if (typeof statName !== "string" || !(statName in statCatalogs)) {
              this.errors.push(
                `${effectContext}.opponent_stat_swap.stat_names[${statIndex}]: unknown ranked stat ${JSON.stringify(statName)}`
              );
            }
          });
          const maxRange = property(swap, "max_target_range");
          if (maxRange !== null && maxRange !== undefined) {
            this.#validateRankedStat(`${effectContext}.opponent_stat_swap`, maxRange, "range");
          }
          const maxStats = property(swap, "max_target_stats");
          if (maxStats !== null && maxStats !== undefined) {
            if (!isRecord(maxStats)) {
              this.errors.push(`${effectContext}.opponent_stat_swap.max_target_stats: must be an object`);
            } else {
              for (const [statName, statValue] of Object.entries(maxStats)) {
                if (!(statName in statCatalogs)) {
                  this.errors.push(
                    `${effectContext}.opponent_stat_swap.max_target_stats.${statName}: unknown ranked stat`
                  );
                } else {
                  this.#validateRankedStat(
                    `${effectContext}.opponent_stat_swap.max_target_stats`,
                    statValue,
                    statName as StatName
                  );
                }
              }
            }
          }
          this.#validateModifierFloors(
            `${effectContext}.opponent_stat_swap.on_success_stat_modifier_floor_effects`,
            property(swap, "on_success_stat_modifier_floor_effects")
          );
        }
      }

      const nullification = property(effect, "power_nullification");
      if (nullification !== null && nullification !== undefined) {
        if (!isRecord(nullification)) {
          this.errors.push(`${effectContext}.power_nullification: must be an object`);
        } else {
          this.#checkRefList(
            `${effectContext}.power_nullification.target_power_ids`,
            property(nullification, "target_power_ids"),
            "powers"
          );
          this.#validatePowerTargets(
            `${effectContext}.power_nullification.target_power_refs`,
            property(nullification, "target_power_refs")
          );
          this.#checkRef(
            `${effectContext}.power_nullification.max_target_modifier`,
            property(nullification, "max_target_modifier"),
            "ability_modifiers",
            true
          );
        }
      }

      const absorption = property(effect, "absorption");
      if (absorption !== null && absorption !== undefined) {
        if (!isRecord(absorption)) {
          this.errors.push(`${effectContext}.absorption: must be an object`);
        } else {
          this.#validatePowerTargets(
            `${effectContext}.absorption.target_power_refs`,
            property(absorption, "target_power_refs")
          );
        }
      }

      const resistanceNegation = property(effect, "resistance_negation");
      if (resistanceNegation !== null && resistanceNegation !== undefined) {
        if (!isRecord(resistanceNegation)) {
          this.errors.push(`${effectContext}.resistance_negation: must be an object`);
        } else {
          this.#checkRefList(
            `${effectContext}.resistance_negation.target_resistance_ids`,
            property(resistanceNegation, "target_resistance_ids"),
            "resistances"
          );
          this.#checkRefList(
            `${effectContext}.resistance_negation.target_immunity_ids`,
            property(resistanceNegation, "target_immunity_ids"),
            "resistances"
          );
        }
      }

      const nonPhysical = property(effect, "non_physical_interaction");
      if (nonPhysical !== null && nonPhysical !== undefined) {
        if (!isRecord(nonPhysical)) {
          this.errors.push(`${effectContext}.non_physical_interaction: must be an object`);
        } else {
          this.#validatePowerTargets(
            `${effectContext}.non_physical_interaction.target_power_refs`,
            property(nonPhysical, "target_power_refs")
          );
        }
      }

      const imageUpdate = property(effect, "image_update");
      if (imageUpdate !== null && imageUpdate !== undefined) {
        if (!isRecord(imageUpdate)) {
          this.errors.push(`${effectContext}.image_update: must be an object`);
        } else {
          const image = property(imageUpdate, "image");
          if (typeof image !== "string" || image.length === 0) {
            this.errors.push(`${effectContext}.image_update.image: must be a non-empty string`);
          } else {
            this.#validateImage(
              `${effectContext}.image_update.image`,
              image,
              undefined,
              property(imageUpdate, "rights_status") === "unverified-third-party" &&
                property(imageUpdate, "publish_unverified") !== true
            );
          }
        }
      }

      const nullifiedBy = property(effect, "nullified_by");
      if (nullifiedBy !== null && nullifiedBy !== undefined) {
        if (!isRecord(nullifiedBy)) {
          this.errors.push(`${effectContext}.nullified_by: must be an object`);
        } else {
          this.#validatePowerRefs(`${effectContext}.nullified_by.power_refs`, property(nullifiedBy, "power_refs"));
          this.#validateResistanceRefs(
            `${effectContext}.nullified_by.resistance_refs`,
            property(nullifiedBy, "resistance_refs")
          );
        }
      }
    });
  }

  #validateModifierFloors(context: string, value: unknown): void {
    if (value === null || value === undefined) return;
    this.#expectArray(context, value).forEach((floor, index) => {
      const floorContext = `${context}[${index}]`;
      if (!isRecord(floor)) {
        this.errors.push(`${floorContext}: must be an object`);
        return;
      }
      const statName = stringProperty(floor, "stat");
      if (!statName || !(statName in statCatalogs)) {
        this.errors.push(`${floorContext}.stat: unknown ranked stat ${JSON.stringify(statName)}`);
      }
      this.#checkRef(`${floorContext}.modifier`, property(floor, "modifier"), "stat_modifiers");
    });
  }

  #validateImage(context: string, imagePath: string, entryId?: string, allowMissing = false): void {
    if (externalAssetPattern.test(imagePath)) {
      this.errors.push(
        `${context}: remote and data image URLs are not supported; ` +
          "store a reviewed source below content/images/characters/"
      );
      return;
    }

    const normalized = normalizeImagePath(imagePath);
    if (normalized.includes("\\") || normalized.split("/").includes("..")) {
      this.errors.push(`${context}: local image path must not contain backslashes or parent traversal`);
      return;
    }
    const requiredPrefix = entryId ? `${publicImagePrefix}${entryId}/` : publicImagePrefix;
    if (!normalized.startsWith(requiredPrefix)) {
      this.errors.push(`${context}: local image must stay under ${requiredPrefix}`);
      return;
    }
    if (!supportedLocalImagePattern.test(normalized)) {
      this.errors.push(`${context}: local image must use AVIF, JPEG, PNG, or WebP so the image build can optimize it`);
      return;
    }

    const contentRoot = path.resolve(this.#root, "content");
    const absolutePath = path.resolve(contentRoot, ...normalized.split("/"));
    const relativeToContent = path.relative(contentRoot, absolutePath);
    if (relativeToContent.startsWith("..") || path.isAbsolute(relativeToContent) || relativeToContent.length === 0) {
      this.errors.push(`${context}: local image escapes content/`);
      return;
    }
    if (!allowMissing) {
      this.#requireFile(context, absolutePath, `content/${normalized}`);
    }
  }

  #requireFile(context: string, absolutePath: string, displayPath: string): void {
    // Asset checks are queued as promises and drained by finish().
    this.#assetChecks.push(
      stat(absolutePath)
        .then((result) => {
          if (!result.isFile()) this.errors.push(`${context}: ${displayPath} is not a file`);
        })
        .catch(() => {
          this.errors.push(`${context}: local image does not exist at ${displayPath}`);
        })
    );
  }

  readonly #assetChecks: Promise<void>[] = [];

  async finish(): Promise<void> {
    await Promise.all(this.#assetChecks);
  }
}

async function loadCatalogs(
  root: string,
  errors: string[]
): Promise<Readonly<Record<CatalogName, readonly CatalogEntrySource[]>>> {
  const directory = path.join(root, "content", "catalogs");
  const files = await yamlFiles(directory);
  const expectedFiles = new Set(catalogNames.map((name) => `${name}.yaml`));

  for (const file of files) {
    if (!expectedFiles.has(file)) {
      errors.push(`content/catalogs/${file}: unknown catalog file`);
    }
  }
  for (const expected of expectedFiles) {
    if (!files.includes(expected)) {
      errors.push(`content/catalogs/${expected}: required catalog file is missing`);
    }
  }

  const pairs = await Promise.all(
    catalogNames.map(async (name) => {
      const value = await parseYamlFile(
        path.join(directory, `${name}.yaml`),
        root,
        catalogSchemas[name] as unknown as ZodType<readonly CatalogEntrySource[]>,
        errors
      ).catch((error: unknown) => {
        errors.push(`content/catalogs/${name}.yaml: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      });
      return [name, value ?? []] as const;
    })
  );

  const catalogs: Partial<Record<CatalogName, readonly CatalogEntrySource[]>> = {};
  for (const [name, entries] of pairs) catalogs[name] = entries;
  return catalogs as Record<CatalogName, readonly CatalogEntrySource[]>;
}

async function loadCharacters(root: string, errors: string[]): Promise<CompiledCharacter[]> {
  const directory = path.join(root, "content", "characters");
  const files = await yamlFiles(directory);
  const characters: CompiledCharacter[] = [];
  const entryFiles = new Map<string, string>();

  for (const file of files) {
    const entryId = file.replace(/\.ya?ml$/i, "");
    if (!slugPattern.test(entryId)) {
      errors.push(
        `content/characters/${file}: filename-derived entry id must use lowercase letters, numbers, and single hyphens`
      );
      continue;
    }
    const previousFile = entryFiles.get(entryId);
    if (previousFile) {
      errors.push(
        `content/characters/${file}: duplicate filename-derived entry id ${entryId}; ` +
          `already defined by content/characters/${previousFile}`
      );
      continue;
    }
    entryFiles.set(entryId, file);
    const character = await parseYamlFile(path.join(directory, file), root, characterSchema, errors);
    if (character) characters.push({ ...character, entry_id: entryId });
  }

  return characters;
}

async function writeAtomically(outputPath: string, contents: string): Promise<void> {
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.tmp`);

  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function compileContent(options: CompileOptions = {}): Promise<CompileResult> {
  const root = path.resolve(options.root ?? defaultRoot);
  const outputPath = path.resolve(options.outputPath ?? path.join(root, "src", "generated", "nexy-data.json"));
  const errors: string[] = [];
  const catalogs = await loadCatalogs(root, errors);
  const characters = await loadCharacters(root, errors);

  if (errors.length > 0) throw new ContentValidationError(errors);

  const validator = new SemanticValidator(root, catalogs);
  validator.validateCatalogs();
  characters.forEach((character, index) => {
    validator.validateCharacter(character, index);
  });
  await validator.validateCatalogImages();
  await validator.finish();

  if (validator.errors.length > 0) {
    throw new ContentValidationError(validator.errors);
  }

  const payload = {
    characters,
    options: catalogs
  };
  const contentRevision = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const data: CompiledData = {
    meta: {
      schema_version: 1,
      content_revision: contentRevision
    },
    ...payload
  };
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const check = options.check === true;
  if (check) {
    try {
      const existing = await readFile(outputPath, "utf8");
      if (existing !== json) {
        throw new ContentValidationError([
          `${path.relative(root, outputPath).replaceAll(path.sep, "/")}: generated data is stale; run pnpm content:build`
        ]);
      }
    } catch (error) {
      const code = error instanceof Error && "code" in error ? Reflect.get(error, "code") : undefined;
      if (code === "ENOENT") {
        throw new ContentValidationError([
          `${path.relative(root, outputPath).replaceAll(path.sep, "/")}: generated data is missing; run pnpm content:build`
        ]);
      }
      throw error;
    }
  } else {
    await writeAtomically(outputPath, json);
  }

  return {
    data,
    json,
    characterCount: characters.length,
    formCount: characters.reduce((total, character) => total + character.keys.length, 0),
    outputPath,
    wroteOutput: !check
  };
}

async function runCli(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const allowedArgs = new Set(["--check"]);
  const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}. Supported: --check`);
  }

  const check = args.has("--check");
  const result = await compileContent({ check });
  const verb = check ? "validated" : "compiled";
  console.log(
    `${verb} ${result.characterCount} characters / ${result.formCount} forms` +
      (check ? "" : ` to ${path.relative(defaultRoot, result.outputPath).replaceAll(path.sep, "/")}`)
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
