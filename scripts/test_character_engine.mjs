import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("_site/index.html", "utf8");
const dataScript = html.match(/<script id="character-data" type="application\/json">([\s\S]*?)<\/script>/);

assert.ok(dataScript, "built site must contain character data");

const context = {
  window: {},
  console,
  getElementById(id) {
    return id === "character-data" ? { textContent: dataScript[1] } : null;
  }
};
context.document = { getElementById: context.getElementById };
vm.createContext(context);

for (const file of ["assets/js/characters/data.js", "assets/js/characters/engine.js"]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const engine = context.window.NexyCharacters;
const stat = (value, modifier = "normal") => ({ value, modifier });

function character(name) {
  return engine.data.characters.find((entry) => entry.name === name);
}

function isolatedCharacter(name, powerRefs = [], resistanceRefs = []) {
  const source = structuredClone(character("Dagger"));
  const key = structuredClone(source.keys[0]);

  Object.assign(key, {
    power_refs: powerRefs,
    resistance_refs: resistanceRefs,
    standard_equipment_ids: [],
    standard_equipment_refs: [],
    optional_equipment_ids: [],
    optional_equipment_refs: [],
    attack_ids: [],
    attack_refs: []
  });

  return { ...source, name, keys: [key] };
}

function testModifierOrdering() {
  const wallAtLeast = engine.compositeRank(stat("wall", "at-least"), "attack_durability_tiers");
  const smallBuildingAtMost = engine.compositeRank(stat("small-building", "at-most"), "attack_durability_tiers");

  assert.equal(smallBuildingAtMost - wallAtLeast, 1, "adjacent stat bands must remain strictly ordered");
  assert.equal(
    engine.compositeRank(stat("inapplicable", "at-least"), "lifting_strength_tiers"),
    engine.compositeRank(stat("inapplicable"), "lifting_strength_tiers"),
    "transcendent stats must ignore modifiers"
  );
  assert.equal(
    engine.formatStat(stat("inapplicable", "at-least"), "lifting_strength_tiers"),
    "Inapplicable",
    "transcendent stats must not display modifiers"
  );
}

function testMagicResistanceLevels() {
  const masterMagic = { id: "magic", magic_level_id: "master-sorcerers" };
  const basicResistance = { id: "magic-resistance", magic_level_id: "basic-level-magic-users" };
  const supremeResistance = { id: "magic-resistance", magic_level_id: "sorcerer-supreme-level" };

  assert.equal(engine.resistanceBlocksPower(masterMagic, basicResistance), false);
  assert.equal(engine.resistanceBlocksPower(masterMagic, supremeResistance), true);
}

function testNonResistibleStatEffects() {
  const sourcePower = {
    id: "mind-manipulation",
    effects: [{
      stat_effects: {
        attack_potency: { ...stat("multi-city-block", "at-least"), resistible: true },
        combat_speed: { ...stat("speed-of-light"), resistible: false }
      }
    }]
  };
  const attacker = engine.characterView(isolatedCharacter("Effect owner", [sourcePower]));
  const resister = engine.characterView(isolatedCharacter(
    "Resister",
    [],
    [{ id: "mind-manipulation-resistance" }]
  ));
  const resistedView = engine.battleEffectiveView(attacker, resister);

  assert.equal(engine.formatStat(resistedView.effectiveKey.combat_speed, "speed_tiers"), "Speed of Light");
  assert.equal(engine.formatStat(resistedView.effectiveKey.attack_potency, "attack_durability_tiers"), "Athlete");
  assert.equal(resistedView.powerRefs.some((ref) => ref.id === "mind-manipulation"), false);

  const nullifier = engine.characterView(isolatedCharacter("Nullifier", [{
    id: "power-nullification",
    effects: [{ power_nullification: { target_power_ids: ["mind-manipulation"] } }]
  }]));
  const nullifiedView = engine.battleEffectiveView(attacker, nullifier);

  assert.equal(engine.formatStat(nullifiedView.effectiveKey.combat_speed, "speed_tiers"), "Hypersonic");
}

function testScoreAndSpeedSelection() {
  const neutralView = (name) => ({ character: { name }, powerRefs: [], effects: [] });
  const score = engine.battleScore(neutralView("Left"), neutralView("Right"), [
    { label: "Tier", left: { rank: 999 }, right: { rank: 1 } },
    { label: "Attack Potency", left: { rank: 80 }, right: { rank: 10 } },
    { label: "Speed", left: { rank: 30 }, right: { rank: 70 } }
  ]);

  assert.deepEqual(
    { left: score.leftScore, right: score.rightScore, gap: score.scoreGap, winner: score.winner },
    { left: 110, right: 80, gap: 30, winner: "left" },
    "scores must sum ranked stats and exclude Tier"
  );

  const luke = engine.characterView(character("Luke Cage"));
  const agentVenom = engine.characterView(character("Agent Venom"));
  const speedRows = engine.battleStatPairs(luke, agentVenom)
    .filter((row) => row.label.includes("Speed"));

  assert.equal(Array.from(speedRows, (row) => row.label).join(","), "Speed");
  assert.match(speedRows[0].left.note, /Travel Speed/);
}

testModifierOrdering();
testMagicResistanceLevels();
testNonResistibleStatEffects();
testScoreAndSpeedSelection();

console.log("character engine tests passed");
