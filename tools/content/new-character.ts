import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stringify } from "yaml";

import { compileContent } from "./build.js";
import { characterSchema, slugSchema } from "./schema.js";

export interface NewCharacterOptions {
  readonly id: string;
  readonly name: string;
  readonly verse: string;
  readonly gender: string;
  readonly form: string;
  readonly identity: string;
  readonly dryRun: boolean;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function usage(): string {
  return [
    "Usage:",
    "  pnpm character:new -- --id storm-marvel-mainstream --name \"Storm\" --verse marvel-mainstream [options]",
    "",
    "Options:",
    "  --gender ID       Gender catalog id (default: unknown)",
    "  --form ID         Initial form id (default: base)",
    "  --identity NAME   Civilian/alternate identity (defaults to --name)",
    "  --dry-run         Print YAML without writing files",
    "  --help            Show this help"
  ].join("\n");
}

function readArguments(args: readonly string[]): NewCharacterOptions | "help" {
  const values = new Map<string, string>();
  let dryRun = false;
  let delimiterSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      if (delimiterSeen || index !== 0) {
        throw new Error("A standalone -- is accepted only once, before all character options");
      }
      delimiterSeen = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") return "help";
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!argument?.startsWith("--")) {
      throw new Error(`Unexpected argument ${JSON.stringify(argument)}\n\n${usage()}`);
    }

    const key = argument.slice(2);
    if (!["id", "name", "verse", "gender", "form", "identity"].includes(key)) {
      throw new Error(`Unknown option ${argument}\n\n${usage()}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value\n\n${usage()}`);
    }
    if (values.has(key)) throw new Error(`${argument} was provided more than once`);
    values.set(key, value);
    index += 1;
  }

  const missing = ["id", "name", "verse"].filter((key) => !values.get(key));
  if (missing.length > 0) {
    throw new Error(`Missing required option(s): ${missing.map((key) => `--${key}`).join(", ")}\n\n${usage()}`);
  }

  const name = values.get("name")!;
  return {
    id: values.get("id")!,
    name,
    verse: values.get("verse")!,
    gender: values.get("gender") ?? "unknown",
    form: values.get("form") ?? "base",
    identity: values.get("identity") ?? name,
    dryRun
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function createCharacter(
  options: NewCharacterOptions,
  projectRoot = root
): Promise<{ readonly yaml: string; readonly entryPath: string; readonly imageDirectory: string }> {
  const idResult = slugSchema.safeParse(options.id);
  if (!idResult.success) throw new Error(`--id ${idResult.error.issues[0]?.message ?? "is invalid"}`);
  const formResult = slugSchema.safeParse(options.form);
  if (!formResult.success) throw new Error(`--form ${formResult.error.issues[0]?.message ?? "is invalid"}`);

  const compiled = await compileContent({ root: projectRoot, check: true });
  const verses = new Set(compiled.data.options.verses.map((entry) => entry.id));
  const genders = new Set(compiled.data.options.genders.map((entry) => entry.id));
  if (!verses.has(options.verse)) {
    throw new Error(`Unknown verse ${JSON.stringify(options.verse)}. Choose one of: ${[...verses].join(", ")}`);
  }
  if (!genders.has(options.gender)) {
    throw new Error(`Unknown gender ${JSON.stringify(options.gender)}. Choose one of: ${[...genders].join(", ")}`);
  }
  if (compiled.data.characters.some((character) => character.entry_id === options.id)) {
    throw new Error(`Character ${options.id} already exists`);
  }

  const character = {
    name: options.name,
    verse_id: options.verse,
    gender_id: options.gender,
    age: {
      value: null,
      unknown: true
    },
    classification_ids: [],
    keys: [
      {
        key: options.form,
        name: "Base",
        names: [options.identity],
        images: [],
        attack_potency: "human",
        combat_speed: "average-human",
        lifting_strength: "average-human",
        striking_strength: "human-level",
        durability: "human",
        stamina: "average",
        range: "standard-melee-range",
        intelligence: "average"
      }
    ]
  };

  const validated = characterSchema.safeParse(character);
  if (!validated.success) {
    throw new Error(`Generated character did not satisfy the source schema: ${validated.error.message}`);
  }

  const yaml = stringify(validated.data, { lineWidth: 0 });
  const entryPath = path.join(projectRoot, "content", "characters", `${options.id}.yaml`);
  const imageDirectory = path.join(projectRoot, "public", "images", "characters", options.id);

  if (!options.dryRun) {
    if (await pathExists(entryPath)) throw new Error(`Refusing to overwrite ${entryPath}`);
    if (await pathExists(imageDirectory)) {
      throw new Error(`Refusing to use existing image directory ${imageDirectory}`);
    }
    await mkdir(imageDirectory);
    await writeFile(entryPath, yaml, { encoding: "utf8", flag: "wx" });
  }

  return { yaml, entryPath, imageDirectory };
}

async function runCli(): Promise<void> {
  const options = readArguments(process.argv.slice(2));
  if (options === "help") {
    console.log(usage());
    return;
  }

  const result = await createCharacter(options);
  if (options.dryRun) {
    process.stdout.write(result.yaml);
    return;
  }

  console.log(`Created ${path.relative(root, result.entryPath).replaceAll(path.sep, "/")}`);
  console.log(`Created ${path.relative(root, result.imageDirectory).replaceAll(path.sep, "/")}/`);
  console.log("Next: add images and verified abilities/stats, then run pnpm content:build && pnpm check");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
