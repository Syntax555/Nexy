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

function characterWithStats(name, stats, powerRefs = []) {
  const source = isolatedCharacter(name, powerRefs);
  Object.assign(source.keys[0], stats);
  return source;
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
  const scorePairs = [
    { label: "Tier", left: { value: "Left Tier", rank: 999 }, right: { value: "Right Tier", rank: 1 } },
    { label: "Attack Potency", left: { value: "Left Attack", rank: 80 }, right: { value: "Right Attack", rank: 10 } },
    { label: "Speed", left: { value: "Left Speed", rank: 30 }, right: { value: "Right Speed", rank: 70 } },
    { label: "Range", left: { value: "Left Range", rank: 20 }, right: { value: "Right Range", rank: 20 } }
  ];
  const leftView = neutralView("Left");
  const rightView = neutralView("Right");
  const score = engine.battleScore(leftView, rightView, scorePairs);

  assert.deepEqual(
    { left: score.leftScore, right: score.rightScore, gap: score.scoreGap, winner: score.winner },
    { left: 130, right: 100, gap: 30, winner: "left" },
    "scores must sum ranked stats and exclude Tier"
  );

  const resultHtml = engine.battleResultHtml(leftView, rightView, scorePairs);
  assert.doesNotMatch(resultHtml, /battle-stat-meter/, "result rows must not use ambiguous proportional meters");
  assert.match(resultHtml, /\u2190 70 pts/, "a left-side win must point toward the left value");
  assert.match(resultHtml, /40 pts \u2192/, "a right-side win must point toward the right value");
  assert.match(resultHtml, />Even</, "tied rows must be explicit");
  assert.match(resultHtml, />Excluded</, "excluded rows must be explicit");

  const luke = engine.characterView(character("Luke Cage"));
  const agentVenom = engine.characterView(character("Agent Venom"));
  const speedRows = engine.battleStatPairs(luke, agentVenom)
    .filter((row) => row.label.includes("Speed"));

  assert.equal(Array.from(speedRows, (row) => row.label).join(","), "Speed");
  assert.match(speedRows[0].left.note, /Travel Speed/);
}

function testDamageTransferal() {
  const escapade = engine.characterView(character("Escapade"));
  const cappedTarget = engine.characterView(characterWithStats("Eligible target", {
    attack_potency: stat("high-outerverse"),
    striking_strength: stat("high-outerverse-level"),
    durability: stat("high-outerverse"),
    range: stat("extended-melee-range")
  }));
  const transferred = engine.battleEffectiveViews(escapade, cappedTarget);

  assert.equal(engine.formatStat(transferred.left.effectiveKey.attack_potency, "attack_durability_tiers"), "High Outerverse");
  assert.equal(engine.formatStat(transferred.right.effectiveKey.attack_potency, "attack_durability_tiers"), "Wall+");
  assert.equal(transferred.left.effectiveKey.combat_speed.modifier, "higher");
  assert.deepEqual(
    Array.from(transferred.left.opponentStatSwap.statNames),
    ["attack_potency", "striking_strength", "durability"]
  );

  const distantTarget = engine.characterView(characterWithStats("Distant target", {
    attack_potency: stat("high-outerverse"),
    striking_strength: stat("high-outerverse-level"),
    durability: stat("high-outerverse"),
    range: stat("several-meters")
  }));
  const distantBattle = engine.battleEffectiveViews(escapade, distantTarget);

  assert.equal(engine.formatStat(distantBattle.left.effectiveKey.attack_potency, "attack_durability_tiers"), "Wall+");
  assert.equal(distantBattle.left.effectiveKey.combat_speed.modifier, "normal");
  assert.equal(distantBattle.left.opponentStatSwap, undefined);

  const overCapTarget = engine.characterView(characterWithStats("Over-cap target", {
    attack_potency: stat("boundless"),
    striking_strength: stat("inapplicable"),
    durability: stat("boundless"),
    range: stat("standard-melee-range")
  }));
  const overCapBattle = engine.battleEffectiveViews(escapade, overCapTarget);

  assert.equal(engine.formatStat(overCapBattle.left.effectiveKey.attack_potency, "attack_durability_tiers"), "Wall+");
  assert.equal(overCapBattle.left.effectiveKey.combat_speed.modifier, "normal");

  const nullifier = engine.characterView(characterWithStats("Nullifier", {
    attack_potency: stat("high-outerverse"),
    striking_strength: stat("high-outerverse-level"),
    durability: stat("high-outerverse"),
    range: stat("standard-melee-range")
  }, [{
    id: "power-nullification",
    effects: [{ power_nullification: { target_power_ids: ["damage-transferal"] } }]
  }]));
  const nullifiedBattle = engine.battleEffectiveViews(escapade, nullifier);

  assert.equal(engine.formatStat(nullifiedBattle.left.effectiveKey.attack_potency, "attack_durability_tiers"), "Wall+");
  assert.equal(nullifiedBattle.left.effectiveKey.combat_speed.modifier, "normal");
  assert.equal(nullifiedBattle.left.powerRefs.some((ref) => ref.id === "damage-transferal"), false);
}

function testCharacterSpecificPlaceholderOverride() {
  const lila = engine.characterView(character("Lila Cheney"));
  const powers = lila.sections.find(([name]) => name === "Powers")[1];
  const power = (id) => powers.find((item) => item.id === id);

  assert.equal(engine.formatStat(lila.effectiveKey.range, "range_tiers"), "Interdimensional");
  assert.equal(power("teleportation").placeholder, false);
  assert.equal(power("dimensional-travel").placeholder, false);
  assert.equal(power("space-survival").placeholder, true);
  assert.equal(power("bfr").placeholder, true);
}

function testWeaponTypeResistance() {
  const caneUserSource = isolatedCharacter("Cane user", [{
    id: "weapon-mastery",
    type_ids: ["all-weapons"]
  }]);
  caneUserSource.keys[0].standard_equipment_ids = ["obliterator-cane"];

  const caneUser = engine.characterView(caneUserSource);
  const bluntResister = engine.characterView(isolatedCharacter(
    "Blunt resister",
    [],
    [{ id: "blunt-weapons-resistance" }]
  ));
  const resistedView = engine.battleEffectiveView(caneUser, bluntResister);

  assert.equal(engine.formatStat(caneUser.effectiveKey.range, "range_tiers"), "Hundreds of Meters");
  assert.equal(caneUser.powerRefs.some((ref) => ref.id === "energy-manipulation"), true);
  assert.equal(engine.formatStat(resistedView.effectiveKey.range, "range_tiers"), "Standard Melee Range");
  assert.equal(resistedView.powerRefs.some((ref) => ref.id === "energy-manipulation"), false);
}

testModifierOrdering();
testMagicResistanceLevels();
testNonResistibleStatEffects();
testScoreAndSpeedSelection();
testDamageTransferal();
testCharacterSpecificPlaceholderOverride();
testWeaponTypeResistance();

console.log("character engine tests passed");
