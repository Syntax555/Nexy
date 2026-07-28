import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  compileContent,
  ContentValidationError
} from "../../tools/content/build.js";
import { createCharacter } from "../../tools/content/new-character.js";

const projectRoot = process.cwd();
const temporaryRoots: string[] = [];

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexy-content-"));
  temporaryRoots.push(root);
  await cp(path.join(projectRoot, "content"), path.join(root, "content"), {
    recursive: true
  });
  await cp(path.join(projectRoot, "public"), path.join(root, "public"), {
    recursive: true
  });
  const generatedDirectory = path.join(root, "src", "generated");
  await mkdir(generatedDirectory, { recursive: true });
  await cp(
    path.join(projectRoot, "src", "generated", "nexy-data.json"),
    path.join(generatedDirectory, "nexy-data.json")
  );
  return root;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runCharacterCli(
  args: readonly string[]
): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const script = path.join(projectRoot, "tools", "content", "new-character.ts");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, script, ...args], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe("content compiler", () => {
  it("validates the repository content deterministically", async () => {
    const first = await compileContent({ root: projectRoot, check: true });
    const second = await compileContent({ root: projectRoot, check: true });

    expect(first.characterCount).toBe(20);
    expect(first.formCount).toBe(21);
    expect(first.json).toBe(second.json);
    expect(first.wroteOutput).toBe(false);
    expect(first.data.characters.map((character) => character.entry_id)).toEqual(
      [...first.data.characters.map((character) => character.entry_id)].sort()
    );

    const localImages = first.data.characters.flatMap((character) =>
      character.keys.flatMap((form) => form.images.map((image) => image.image))
    );
    expect(localImages.length).toBeGreaterThan(0);
    expect(localImages.every((image) => image.startsWith("images/characters/"))).toBe(true);
    expect(localImages.some((image) => image.startsWith("assets/"))).toBe(false);
    expect(
      first.data.characters.every((character) =>
        character.sources.length > 0
        && character.sources.every((source) =>
          source.url.startsWith("https://")
          && source.accessed_on === "2026-07-28"
        )
        && character.keys.every((form) =>
          form.source_ids.length > 0
          && form.source_ids.every((sourceId) =>
            character.sources.some((source) => source.id === sourceId)
          )
          && form.images.every((image) =>
            image.source_url.startsWith("https://")
            && image.rights_status === "unverified-third-party"
            && image.publish_unverified === true
            && Boolean(image.rights_holder)
          )
        )
      )
    ).toBe(true);
  });

  it("does not rewrite output in check mode and writes canonical JSON in build mode", async () => {
    const root = await temporaryProject();
    const outputPath = path.join(root, "src", "generated", "nexy-data.json");
    const beforeCheck = await readFile(outputPath, "utf8");

    const checked = await compileContent({ root, check: true, outputPath });
    expect(checked.wroteOutput).toBe(false);
    expect(await readFile(outputPath, "utf8")).toBe(beforeCheck);

    const built = await compileContent({ root, outputPath });
    expect(built.wroteOutput).toBe(true);
    expect(await readFile(outputPath, "utf8")).toBe(built.json);
  });

  it("rejects missing generated data in check mode", async () => {
    const root = await temporaryProject();
    const outputPath = path.join(root, "src", "generated", "nexy-data.json");
    await rm(outputPath);

    await expect(
      compileContent({ root, check: true, outputPath })
    ).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining("generated data is missing")
      ])
    });
    expect(await exists(outputPath)).toBe(false);
  });

  it("rejects stale generated data without rewriting it", async () => {
    const root = await temporaryProject();
    const outputPath = path.join(root, "src", "generated", "nexy-data.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, "{\"stale\":true}\n", "utf8");

    await expect(
      compileContent({ root, check: true, outputPath })
    ).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining("generated data is stale")
      ])
    });
    expect(await readFile(outputPath, "utf8")).toBe("{\"stale\":true}\n");
  });

  it("rejects duplicate YAML keys with a filename and line", async () => {
    const root = await temporaryProject();
    const entryPath = path.join(
      root,
      "content",
      "characters",
      "agent-venom-marvel-mainstream.yaml"
    );
    const source = await readFile(entryPath, "utf8");
    await writeFile(entryPath, `${source}\nname: Duplicate\n`, "utf8");

    await expect(compileContent({ root, check: true })).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining("Map keys must be unique")
      ])
    });
  });

  it("rejects duplicate filename-derived character ids", async () => {
    const root = await temporaryProject();
    const characters = path.join(root, "content", "characters");
    await cp(
      path.join(characters, "agent-venom-marvel-mainstream.yaml"),
      path.join(characters, "agent-venom-marvel-mainstream.yml")
    );

    await expect(compileContent({ root, check: true })).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining("duplicate filename-derived entry id agent-venom-marvel-mainstream")
      ])
    });
  });

  it("rejects unknown references, rank gaps, and character image escapes", async () => {
    const root = await temporaryProject();
    const characterPath = path.join(
      root,
      "content",
      "characters",
      "agent-venom-marvel-mainstream.yaml"
    );
    const character = await readFile(characterPath, "utf8");
    await writeFile(
      characterPath,
      character
        .replace("verse_id: marvel-mainstream", "verse_id: missing-verse")
        .replace(
          "images/characters/agent-venom-marvel-mainstream/agent-venom.webp",
          "images/characters/another-character/agent-venom.webp"
        ),
      "utf8"
    );

    const ranksPath = path.join(root, "content", "catalogs", "stat_modifiers.yaml");
    const ranks = await readFile(ranksPath, "utf8");
    await writeFile(ranksPath, ranks.replace("rank: 2", "rank: 20"), "utf8");

    let failure: unknown;
    try {
      await compileContent({ root, check: true });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ContentValidationError);
    const messages = (failure as ContentValidationError).errors.join("\n");
    expect(messages).toContain("unknown verses id \"missing-verse\"");
    expect(messages).toContain("values must be contiguous");
    expect(messages).toContain(
      "local image must stay under images/characters/agent-venom-marvel-mainstream/"
    );
  });

  it("rejects local image formats that the optimization build cannot process", async () => {
    const root = await temporaryProject();
    const characterPath = path.join(
      root,
      "content",
      "characters",
      "agent-venom-marvel-mainstream.yaml"
    );
    const imageDirectory = path.join(
      root,
      "public",
      "images",
      "characters",
      "agent-venom-marvel-mainstream"
    );
    await mkdir(imageDirectory, { recursive: true });
    await writeFile(path.join(imageDirectory, "agent-venom.gif"), "test", "utf8");
    const character = await readFile(characterPath, "utf8");
    await writeFile(
      characterPath,
      character.replace(
        "images/characters/agent-venom-marvel-mainstream/agent-venom.webp",
        "images/characters/agent-venom-marvel-mainstream/agent-venom.gif"
      ),
      "utf8"
    );

    await expect(compileContent({ root, check: true })).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining(
          "local image must use AVIF, JPEG, PNG, or WebP"
        )
      ])
    });
  });

  it("rejects unknown and duplicate character source references", async () => {
    const root = await temporaryProject();
    const characterPath = path.join(
      root,
      "content",
      "characters",
      "agent-venom-marvel-mainstream.yaml"
    );
    const character = await readFile(characterPath, "utf8");
    await writeFile(
      characterPath,
      character
        .replace(
          '    accessed_on: "2026-07-28"\nkeys:',
          [
            '    accessed_on: "2026-07-28"',
            "  - id: vs-battles-wiki-profile",
            '    name: "Duplicate source"',
            '    url: "https://example.com/duplicate"',
            '    publisher: "Example"',
            '    license: "Example licence"',
            '    accessed_on: "2026-07-28"',
            "keys:"
          ].join("\n")
        )
        .replace(
          "      - vs-battles-wiki-profile\n    power_refs:",
          "      - missing-profile\n    power_refs:"
        ),
      "utf8"
    );

    await expect(compileContent({ root, check: true })).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining("duplicate character source id vs-battles-wiki-profile"),
        expect.stringContaining('unknown character source id "missing-profile"')
      ])
    });
  });

  it("rejects invalid provenance URLs, dates, and conditional image rights fields", async () => {
    const root = await temporaryProject();
    const agentPath = path.join(
      root,
      "content",
      "characters",
      "agent-venom-marvel-mainstream.yaml"
    );
    const agent = await readFile(agentPath, "utf8");
    await writeFile(
      agentPath,
      agent
        .replace(
          "https://vsbattles.fandom.com/wiki/Agent_Venom",
          "http://vsbattles.fandom.com/wiki/Agent_Venom"
        )
        .replace('accessed_on: "2026-07-28"', 'accessed_on: "2026-02-30"'),
      "utf8"
    );

    const auroraPath = path.join(
      root,
      "content",
      "characters",
      "aurora-marvel-mainstream.yaml"
    );
    const aurora = await readFile(auroraPath, "utf8");
    await writeFile(
      auroraPath,
      aurora
        .replace(
          "https://vsbattles.fandom.com/wiki/File:Aurora-Render.png",
          "http://vsbattles.fandom.com/wiki/File:Aurora-Render.png"
        )
        .replace(
          "        rights_status: unverified-third-party",
          "        rights_status: licensed"
        )
        .replace('        rights_holder: "Unknown / respective rights holders"\n', ""),
      "utf8"
    );

    const daggerPath = path.join(
      root,
      "content",
      "characters",
      "dagger-marvel-mainstream.yaml"
    );
    const dagger = await readFile(daggerPath, "utf8");
    await writeFile(
      daggerPath,
      dagger.replace('        rights_holder: "Unknown / respective rights holders"\n', ""),
      "utf8"
    );

    let failure: unknown;
    try {
      await compileContent({ root, check: true });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ContentValidationError);
    const messages = (failure as ContentValidationError).errors.join("\n");
    expect(messages).toContain("must use HTTPS");
    expect(messages).toContain("must be a valid calendar date");
    expect(messages).toContain("is required when rights_status is licensed");
    expect(messages).toContain(
      "is required when rights_status is unverified-third-party"
    );
  });

  it("requires every verse to reference an origin in the same media", async () => {
    const root = await temporaryProject();
    const mediaPath = path.join(root, "content", "catalogs", "media.yaml");
    await writeFile(
      mediaPath,
      `${await readFile(mediaPath, "utf8")}\n- id: animation\n  name: \"Animation\"\n`,
      "utf8"
    );
    const versesPath = path.join(root, "content", "catalogs", "verses.yaml");
    const verses = await readFile(versesPath, "utf8");
    await writeFile(
      versesPath,
      verses.replace(
        "- id: marvel-mainstream\n  name: \"Mainstream\"\n  media_id: comics",
        "- id: marvel-mainstream\n  name: \"Mainstream\"\n  media_id: animation"
      ),
      "utf8"
    );

    await expect(compileContent({ root, check: true })).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining(
          'media_id: "animation" must match origin "marvel-comics" media_id "comics"'
        )
      ])
    });
  });

  it("rejects unknown catalog and nested effect fields", async () => {
    const root = await temporaryProject();
    const mediaPath = path.join(root, "content", "catalogs", "media.yaml");
    const media = await readFile(mediaPath, "utf8");
    await writeFile(
      mediaPath,
      media.replace('name: "Comics"', 'name: "Comics"\n  display_nmae: "Typo"'),
      "utf8"
    );

    const powersPath = path.join(root, "content", "catalogs", "powers.yaml");
    const powers = await readFile(powersPath, "utf8");
    const withSingularTarget = powers.replace(
      /(power_nullification:\r?\n)(\s+)(target_power_refs:)/,
      "$1$2target_power_id: regeneration\n$2$3"
    );
    expect(withSingularTarget).not.toBe(powers);
    await writeFile(powersPath, withSingularTarget, "utf8");

    let failure: unknown;
    try {
      await compileContent({ root, check: true });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ContentValidationError);
    const messages = (failure as ContentValidationError).errors.join("\n");
    expect(messages).toContain("display_nmae");
    expect(messages).toContain("target_power_id");
  });

  it("accepts variant- and magic-level-specific power targets", async () => {
    const root = await temporaryProject();
    const powersPath = path.join(root, "content", "catalogs", "powers.yaml");
    const powers = await readFile(powersPath, "utf8");
    const targeted = powers.replace(
      /          - id: regeneration\r?\n        max_target_type_rank: 4/,
      [
        "          - id: light-manipulation",
        "            source_variant: dagger-lightforce",
        "            magic_level_id: basic-level-magic-users",
        "        max_target_type_rank: 4"
      ].join("\n")
    );
    expect(targeted).not.toBe(powers);
    await writeFile(powersPath, targeted, "utf8");

    const compiled = await compileContent({ root });
    const compiledCatalogs = JSON.stringify(compiled.data.options.powers);
    expect(compiledCatalogs).toContain('"source_variant":"dagger-lightforce"');
    expect(compiledCatalogs).toContain('"magic_level_id":"basic-level-magic-users"');
  });

  it("rejects unknown magic levels and variants in power targets", async () => {
    const root = await temporaryProject();
    const powersPath = path.join(root, "content", "catalogs", "powers.yaml");
    const powers = await readFile(powersPath, "utf8");
    const targeted = powers.replace(
      /          - id: regeneration\r?\n        max_target_type_rank: 4/,
      [
        "          - id: light-manipulation",
        "            source_variant: missing-light-variant",
        "            magic_level_id: missing-magic-level",
        "        max_target_type_rank: 4"
      ].join("\n")
    );
    expect(targeted).not.toBe(powers);
    await writeFile(powersPath, targeted, "utf8");

    let failure: unknown;
    try {
      await compileContent({ root, check: true });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ContentValidationError);
    const messages = (failure as ContentValidationError).errors.join("\n");
    expect(messages).toContain('unknown magic_levels id "missing-magic-level"');
    expect(messages).toContain(
      'unknown variant "missing-light-variant" for power "light-manipulation"'
    );
  });

  it("rejects invalid numeric, enum, and boolean catalog values", async () => {
    const root = await temporaryProject();
    const derivedPath = path.join(
      root,
      "content",
      "catalogs",
      "derived_power_rules.yaml"
    );
    const derived = await readFile(derivedPath, "utf8");
    await writeFile(
      derivedPath,
      derived
        .replace("min_matches: 2", 'min_matches: "two"')
        .replace("comparison: at-least", "comparison: above"),
      "utf8"
    );

    const equipmentPath = path.join(root, "content", "catalogs", "equipment.yaml");
    const equipment = await readFile(equipmentPath, "utf8");
    await writeFile(
      equipmentPath,
      equipment.replace("priority: 10", 'priority: "high"'),
      "utf8"
    );

    const classificationsPath = path.join(
      root,
      "content",
      "catalogs",
      "classifications.yaml"
    );
    const classifications = await readFile(classificationsPath, "utf8");
    await writeFile(
      classificationsPath,
      classifications.replace("filterable: false", 'filterable: "sometimes"'),
      "utf8"
    );

    let failure: unknown;
    try {
      await compileContent({ root, check: true });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ContentValidationError);
    const messages = (failure as ContentValidationError).errors.join("\n");
    expect(messages).toContain("min_matches");
    expect(messages).toContain("comparison");
    expect(messages).toContain("priority");
    expect(messages).toContain("filterable");
  });

  it("rejects typos in closed catalog vocabularies", async () => {
    const root = await temporaryProject();
    const abilityPath = path.join(
      root,
      "content",
      "catalogs",
      "ability_modifiers.yaml"
    );
    const abilities = await readFile(abilityPath, "utf8");
    await writeFile(
      abilityPath,
      abilities.replace("availability: always", "availability: alway"),
      "utf8"
    );

    const liftingPath = path.join(
      root,
      "content",
      "catalogs",
      "lifting_strength_tiers.yaml"
    );
    const lifting = await readFile(liftingPath, "utf8");
    await writeFile(
      liftingPath,
      lifting
        .replace("comparison_class: transcendent", "comparison_class: transcendental")
        .replace("modifier_behavior: locked_to_normal", "modifier_behavior: locked_normal"),
      "utf8"
    );

    const naturePath = path.join(
      root,
      "content",
      "catalogs",
      "magic_natures.yaml"
    );
    const nature = await readFile(naturePath, "utf8");
    await writeFile(
      naturePath,
      nature
        .replace("applies_to: raw_magic", "applies_to: raw-magic")
        .replace("ownership: effect_payload", "ownership: effect-payload"),
      "utf8"
    );

    let failure: unknown;
    try {
      await compileContent({ root, check: true });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ContentValidationError);
    const messages = (failure as ContentValidationError).errors.join("\n");
    expect(messages).toContain("availability");
    expect(messages).toContain("comparison_class");
    expect(messages).toContain("modifier_behavior");
    expect(messages).toContain("applies_to");
    expect(messages).toContain("ownership");
  });

  it("rejects derived rules that require more matches than requirements", async () => {
    const root = await temporaryProject();
    const derivedPath = path.join(
      root,
      "content",
      "catalogs",
      "derived_power_rules.yaml"
    );
    const derived = await readFile(derivedPath, "utf8");
    await writeFile(
      derivedPath,
      derived.replace("min_matches: 2", "min_matches: 5"),
      "utf8"
    );

    await expect(compileContent({ root, check: true })).rejects.toMatchObject({
      name: "ContentValidationError",
      errors: expect.arrayContaining([
        expect.stringContaining(
          "min_matches: 5 cannot exceed requirements.length (4)"
        )
      ])
    });
  });
});

describe("new character CLI", () => {
  it("creates a valid dry-run scaffold without touching the workspace", async () => {
    const id = "compiler-test-character";
    const result = await createCharacter({
      id,
      name: "Compiler Test",
      verse: "marvel-mainstream",
      gender: "unknown",
      form: "base",
      identity: "Compiler Test",
      sourceUrl: "https://vsbattles.fandom.com/wiki/Compiler_Test",
      dryRun: true
    });

    expect(result.yaml).toContain("name: Compiler Test");
    expect(result.yaml).toContain("verse_id: marvel-mainstream");
    expect(result.yaml).toContain("id: vs-battles-wiki-profile");
    expect(result.yaml).toContain(
      "url: https://vsbattles.fandom.com/wiki/Compiler_Test"
    );
    expect(result.yaml).toContain("source_ids:");
    expect(await exists(result.entryPath)).toBe(false);
    expect(await exists(result.imageDirectory)).toBe(false);
  });

  it("accepts the standalone delimiter forwarded by the documented pnpm command", async () => {
    const id = "spawned-compiler-test-character";
    const result = await runCharacterCli([
      "--",
      "--id",
      id,
      "--name",
      "Spawned Compiler Test",
      "--verse",
      "marvel-mainstream",
      "--source-url",
      "https://vsbattles.fandom.com/wiki/Spawned_Compiler_Test",
      "--image",
      "base.webp",
      "--image-source-url",
      "https://vsbattles.fandom.com/wiki/File:Spawned_Compiler_Test.webp",
      "--image-rights-holder",
      "Example Rights Holder",
      "--dry-run"
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("name: Spawned Compiler Test");
    expect(result.stdout).toContain("verse_id: marvel-mainstream");
    expect(result.stdout).toContain("rights_status: unverified-third-party");
    expect(result.stdout).toContain("rights_holder: Example Rights Holder");
    expect(await exists(path.join(projectRoot, "content", "characters", `${id}.yaml`))).toBe(false);
  });
});
