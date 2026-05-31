#!/usr/bin/env ruby
# frozen_string_literal: true

require "set"
require "yaml"

ROOT = File.expand_path("..", __dir__)
CHARACTERS_FILE = File.join(ROOT, "_data", "characters.yml")

def fail_with(message)
  warn "characters.yml validation failed:"
  warn message
  exit 1
end

def errors_for_ids(name, entries)
  return ["options.#{name} must be a list"] unless entries.is_a?(Array)

  seen = {}
  errors = []

  entries.each_with_index do |entry, index|
    unless entry.is_a?(Hash)
      errors << "options.#{name}[#{index}] must be a map"
      next
    end

    id = entry["id"]
    if id.nil? || id.to_s.empty?
      errors << "options.#{name}[#{index}] is missing id"
      next
    end

    if seen.key?(id)
      errors << "options.#{name} has duplicate id #{id.inspect}"
    else
      seen[id] = true
    end
  end

  errors
end

def id_set(entries)
  Array(entries).filter_map { |entry| entry["id"] if entry.is_a?(Hash) }.to_set
end

def validate_unique_integer_field(name, entries, field, minimum_value: 1)
  errors = []
  seen = {}

  Array(entries).each do |entry|
    next unless entry.is_a?(Hash)
    next unless entry.key?(field)

    value = entry[field]
    id = entry["id"]

    unless value.is_a?(Integer) && value >= minimum_value
      errors << "options.#{name}.#{id} #{field} must be an integer greater than or equal to #{minimum_value}"
      next
    end

    if seen.key?(value)
      errors << "options.#{name} #{field} #{value} is used by both #{seen[value].inspect} and #{id.inspect}"
    else
      seen[value] = id
    end
  end

  errors
end

def validate_unique_ranks(name, entries, minimum_rank: 1)
  validate_unique_integer_field(name, entries, "rank", minimum_value: minimum_rank)
end

def validate_refs(context, values, allowed, label, allow_blank: false)
  Array(values).filter_map do |value|
    next if allow_blank && (value.nil? || value == "")
    next if value.nil?
    next if allowed.include?(value)

    "#{context} references unknown #{label} #{value.inspect}"
  end
end

def validate_ranked_stat(context, stat, allowed_values, stat_modifiers, allow_null: false)
  return [] if allow_null && stat.nil?

  if stat.is_a?(String)
    value = stat
    modifier = "normal"
  elsif stat.is_a?(Hash)
    value = stat["value"]
    modifier = stat.fetch("modifier", "normal")
  else
    return ["#{context} must be a ranked stat map or tier id string"]
  end

  errors = []

  errors.concat(validate_refs("#{context}.value", [value], allowed_values, "tier"))
  errors.concat(validate_refs("#{context}.modifier", [modifier], stat_modifiers, "stat modifier"))
  errors
end

def validate_images(context, images)
  return ["#{context} must be a list"] unless images.is_a?(Array)

  errors = []

  images.each_with_index do |image, index|
    image_context = "#{context}[#{index}]"

    unless image.is_a?(Hash)
      errors << "#{image_context} must be a map"
      next
    end

    errors << "#{image_context}.name must be present" if image["name"].nil? || image["name"].to_s.empty?
    errors << "#{image_context}.image must be present" if image["image"].nil? || image["image"].to_s.empty?
  end

  errors
end

def validate_power_refs(context, refs, sets)
  errors = []

  unless refs.is_a?(Array)
    return ["#{context} must be a list"]
  end

  refs.each_with_index do |ref, index|
    ref_context = "#{context}[#{index}]"

    unless ref.is_a?(Hash)
      errors << "#{ref_context} must be a map"
      next
    end

    errors.concat(validate_refs("#{ref_context}.id", [ref["id"]], sets[:powers], "power"))
    errors.concat(validate_refs("#{ref_context}.modifier", [ref["modifier"] || "normal"], sets[:ability_modifiers], "ability modifier"))
    errors.concat(validate_refs("#{ref_context}.type_ids", ref["type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_refs("#{ref_context}.martial_arts_degree_id", [ref["martial_arts_degree_id"]], sets[:martial_arts_degrees], "martial arts degree"))
    errors.concat(validate_refs("#{ref_context}.acrobatics_degree_id", [ref["acrobatics_degree_id"]], sets[:acrobatics_degrees], "acrobatics degree"))
    errors.concat(validate_refs("#{ref_context}.magic_level_id", [ref["magic_level_id"]], sets[:magic_levels], "magic level"))
    errors.concat(validate_refs("#{ref_context}.magic_nature_ids", ref["magic_nature_ids"], sets[:magic_natures], "magic nature"))
  end

  errors
end

def validate_resistance_refs(context, refs, sets)
  errors = []

  unless refs.is_a?(Array)
    return ["#{context} must be a list"]
  end

  refs.each_with_index do |ref, index|
    ref_context = "#{context}[#{index}]"

    unless ref.is_a?(Hash)
      errors << "#{ref_context} must be a map"
      next
    end

    errors.concat(validate_refs("#{ref_context}.id", [ref["id"]], sets[:resistances], "resistance"))
    errors.concat(validate_refs("#{ref_context}.level", [ref["level"] || "resistant"], sets[:resistance_levels], "resistance level"))
    errors.concat(validate_refs("#{ref_context}.modifier", [ref["modifier"] || "normal"], sets[:ability_modifiers], "ability modifier"))
    errors.concat(validate_refs("#{ref_context}.type_ids", ref["type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_refs("#{ref_context}.magic_level_id", [ref["magic_level_id"]], sets[:magic_levels], "magic level"))
    errors.concat(validate_refs("#{ref_context}.magic_nature_ids", ref["magic_nature_ids"], sets[:magic_natures], "magic nature"))
  end

  errors
end

def validate_effect(context, effect, sets)
  return ["#{context} must be a map"] unless effect.is_a?(Hash)

  errors = []

  if effect["grants"].is_a?(Hash)
    grants = effect["grants"]
    errors.concat(validate_power_refs("#{context}.grants.power_refs", grants["power_refs"] || [], sets))
    errors.concat(validate_resistance_refs("#{context}.grants.resistance_refs", grants["resistance_refs"] || [], sets))
  end

  if effect["power_nullification"].is_a?(Hash)
    errors.concat(validate_refs("#{context}.power_nullification.target_power_ids", effect["power_nullification"]["target_power_ids"], sets[:powers], "power"))
  end

  if effect["resistance_negation"].is_a?(Hash)
    negation = effect["resistance_negation"]
    errors.concat(validate_refs("#{context}.resistance_negation.target_resistance_ids", negation["target_resistance_ids"], sets[:resistances], "resistance"))
    errors.concat(validate_refs("#{context}.resistance_negation.target_immunity_ids", negation["target_immunity_ids"], sets[:resistances], "resistance"))
  end

  errors
end

def validate_catalog_entry(context, entry, sets, type)
  errors = []

  unless entry.is_a?(Hash)
    return ["#{context} must be a map"]
  end

  errors << "#{context} is missing id" if entry["id"].nil? || entry["id"].to_s.empty?

  case type
  when :power_type
    errors.concat(validate_refs("#{context}.power_id", [entry["power_id"]], sets[:powers], "power"))
    errors.concat(validate_refs("#{context}.covers_type_ids", entry["covers_type_ids"], sets[:power_types], "power type"))
  when :power
    errors.concat(validate_refs("#{context}.type_ids", entry["type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_refs("#{context}.degree_ids", entry["degree_ids"], sets[:martial_arts_degrees] | sets[:acrobatics_degrees], "degree"))
    if entry["grants"].is_a?(Hash)
      grants = entry["grants"]
      errors.concat(validate_power_refs("#{context}.grants.power_refs", grants["power_refs"] || [], sets))
      errors.concat(validate_resistance_refs("#{context}.grants.resistance_refs", grants["resistance_refs"] || [], sets))
      errors.concat(validate_refs("#{context}.grants.magic_level_ids", grants["magic_level_ids"], sets[:magic_levels], "magic level"))
    end
  when :resistance
    errors.concat(validate_refs("#{context}.resists_power_ids", entry["resists_power_ids"], sets[:powers], "power"))
  when :magic_level
    errors.concat(validate_refs("#{context}.inherits_level_ids", entry["inherits_level_ids"], sets[:magic_levels], "magic level"))
    errors.concat(validate_power_refs("#{context}.power_refs", entry["power_refs"] || [], sets))
    errors.concat(validate_resistance_refs("#{context}.resistance_refs", entry["resistance_refs"] || [], sets))
  when :magic_nature
    errors.concat(validate_refs("#{context}.inherits_nature_ids", entry["inherits_nature_ids"], sets[:magic_natures], "magic nature"))
    errors.concat(validate_power_refs("#{context}.power_refs", entry["power_refs"] || [], sets))
    errors.concat(validate_resistance_refs("#{context}.resistance_refs", entry["resistance_refs"] || [], sets))
  when :equipment, :attack
    errors.concat(validate_refs("#{context}.weapon_type_ids", entry["weapon_type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_power_refs("#{context}.required_power_refs", entry["required_power_refs"] || [], sets))
  end

  Array(entry["effects"]).each_with_index do |effect, index|
    errors.concat(validate_effect("#{context}.effects[#{index}]", effect, sets))
  end

  errors
end

def validate_character(context, character, sets)
  return ["#{context} must be a map"] unless character.is_a?(Hash)

  errors = []
  keys = character["keys"]

  errors.concat(validate_refs("#{context}.verse_id", [character["verse_id"]], sets[:verses], "verse", allow_blank: true))
  errors.concat(validate_refs("#{context}.gender_id", [character["gender_id"]], sets[:genders], "gender"))
  errors.concat(validate_refs("#{context}.classification_ids", character["classification_ids"], sets[:classifications], "classification"))

  unless keys.is_a?(Array) && keys.any?
    errors << "#{context}.keys must contain at least one key"
    return errors
  end

  seen_keys = {}

  keys.each_with_index do |key, index|
    key_context = "#{context}.keys[#{index}]"

    unless key.is_a?(Hash)
      errors << "#{key_context} must be a map"
      next
    end

    key_id = key["key"]
    if key_id.nil? || key_id.to_s.empty?
      errors << "#{key_context}.key must be present" unless context == "empty_character"
    elsif seen_keys.key?(key_id)
      errors << "#{context}.keys has duplicate key #{key_id.inspect}"
    else
      seen_keys[key_id] = true
    end

    errors.concat(validate_images("#{key_context}.images", key["images"] || []))
    errors.concat(validate_power_refs("#{key_context}.power_refs", key["power_refs"] || [], sets))
    errors.concat(validate_resistance_refs("#{key_context}.resistance_refs", key["resistance_refs"] || [], sets))
    errors.concat(validate_refs("#{key_context}.standard_equipment_ids", key["standard_equipment_ids"], sets[:equipment], "equipment"))
    errors.concat(validate_refs("#{key_context}.optional_equipment_ids", key["optional_equipment_ids"], sets[:equipment], "equipment"))
    errors.concat(validate_refs("#{key_context}.attack_ids", key["attack_ids"], sets[:attacks], "attack"))

    errors.concat(validate_ranked_stat("#{key_context}.attack_potency", key["attack_potency"], sets[:attack_durability_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.attack_speed", key["attack_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_ranked_stat("#{key_context}.combat_speed", key["combat_speed"], sets[:speed_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.reaction_speed", key["reaction_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_ranked_stat("#{key_context}.travel_speed", key["travel_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_ranked_stat("#{key_context}.flight_speed", key["flight_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_ranked_stat("#{key_context}.lifting_strength", key["lifting_strength"], sets[:lifting_strength_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.striking_strength", key["striking_strength"], sets[:striking_strength_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.durability", key["durability"], sets[:attack_durability_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.stamina", key["stamina"], sets[:stamina_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.range", key["range"], sets[:range_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.intelligence", key["intelligence"], sets[:intelligence_tiers], sets[:stat_modifiers]))
  end

  errors
end

data = YAML.safe_load_file(CHARACTERS_FILE, aliases: true)
options = data.fetch("options")
errors = []

catalog_names = %w[
  stat_modifiers
  ability_modifiers
  resistance_levels
  media
  origins
  verses
  genders
  classifications
  power_types
  martial_arts_degrees
  acrobatics_degrees
  powers
  resistances
  magic_levels
  magic_natures
  equipment
  attacks
  attack_durability_tiers
  speed_tiers
  lifting_strength_tiers
  striking_strength_tiers
  intelligence_tiers
  range_tiers
  stamina_tiers
]

catalog_names.each do |name|
  errors.concat(errors_for_ids(name, options[name]))
end

ranked_catalog_names = %w[
  stat_modifiers
  ability_modifiers
  resistance_levels
  martial_arts_degrees
  acrobatics_degrees
  magic_levels
  attack_durability_tiers
  speed_tiers
  lifting_strength_tiers
  striking_strength_tiers
  intelligence_tiers
  range_tiers
  stamina_tiers
]

ranked_catalog_names.each do |name|
  minimum_rank = %w[martial_arts_degrees acrobatics_degrees].include?(name) ? 0 : 1
  errors.concat(validate_unique_ranks(name, options[name], minimum_rank: minimum_rank))
end

errors.concat(validate_unique_integer_field("ability_modifiers", options["ability_modifiers"], "coverage_rank"))

sets = catalog_names.to_h { |name| [name.to_sym, id_set(options[name])] }

Array(options["verses"]).each_with_index do |verse, index|
  context = "options.verses[#{index}]"
  errors.concat(validate_refs("#{context}.media_id", [verse["media_id"]], sets[:media], "media"))
  errors.concat(validate_refs("#{context}.source_id", [verse["source_id"]], sets[:origins], "origin"))
end

Array(options["power_types"]).each_with_index do |entry, index|
  errors.concat(validate_catalog_entry("options.power_types[#{index}]", entry, sets, :power_type))
end

Array(options["powers"]).each_with_index do |entry, index|
  errors.concat(validate_catalog_entry("options.powers[#{index}]", entry, sets, :power))
end

Array(options["resistances"]).each_with_index do |entry, index|
  errors.concat(validate_catalog_entry("options.resistances[#{index}]", entry, sets, :resistance))
end

Array(options["magic_levels"]).each_with_index do |entry, index|
  errors.concat(validate_catalog_entry("options.magic_levels[#{index}]", entry, sets, :magic_level))
end

Array(options["magic_natures"]).each_with_index do |entry, index|
  errors.concat(validate_catalog_entry("options.magic_natures[#{index}]", entry, sets, :magic_nature))
end

Array(options["equipment"]).each_with_index do |entry, index|
  errors.concat(validate_catalog_entry("options.equipment[#{index}]", entry, sets, :equipment))
end

Array(options["attacks"]).each_with_index do |entry, index|
  errors.concat(validate_catalog_entry("options.attacks[#{index}]", entry, sets, :attack))
end

errors.concat(validate_character("empty_character", data["empty_character"], sets))

characters = data["characters"]

if characters.nil?
  errors << "characters must be present"
elsif !characters.is_a?(Array)
  errors << "characters must be a list"
else
  seen_character_names = {}

  characters.each_with_index do |character, index|
    context = "characters[#{index}]"

    if character.is_a?(Hash)
      name = character["name"]

      if name.nil? || name.to_s.empty?
        errors << "#{context}.name must be present"
      elsif seen_character_names.key?(name)
        errors << "characters has duplicate name #{name.inspect}"
      else
        seen_character_names[name] = true
      end
    end

    errors.concat(validate_character(context, character, sets))
  end
end

if errors.any?
  fail_with(errors.map { |error| "- #{error}" }.join("\n"))
end

puts "characters.yml validation passed"
