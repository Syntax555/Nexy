#!/usr/bin/env ruby
# frozen_string_literal: true

require "set"
require "yaml"

ROOT = File.expand_path("..", __dir__)
CHARACTERS_DIR = File.join(ROOT, "_data", "characters")
CHARACTER_ENTRIES_DIR = File.join(CHARACTERS_DIR, "entries")
OPTIONS_DIR = File.join(CHARACTERS_DIR, "options")

STAT_CATALOGS = {
  "attack_potency" => :attack_durability_tiers,
  "attack_speed" => :speed_tiers,
  "combat_speed" => :speed_tiers,
  "reaction_speed" => :speed_tiers,
  "travel_speed" => :speed_tiers,
  "flight_speed" => :speed_tiers,
  "lifting_strength" => :lifting_strength_tiers,
  "striking_strength" => :striking_strength_tiers,
  "durability" => :attack_durability_tiers,
  "stamina" => :stamina_tiers,
  "range" => :range_tiers,
  "intelligence" => :intelligence_tiers
}.freeze

def load_yaml(path)
  YAML.safe_load_file(path, aliases: true)
end

def load_characters_data
  character_entries = load_character_entries
  characters = character_entries
               .map { |entry_id, character| character.merge("entry_id" => entry_id) }

  {
    "schema" => load_yaml(File.join(CHARACTERS_DIR, "schema.yml")),
    "options" => load_options_data,
    "characters" => characters
  }
end

def load_character_entries
  Dir.children(CHARACTER_ENTRIES_DIR)
     .grep(/\.ya?ml\z/)
     .sort
     .to_h do |filename|
       key = File.basename(filename, File.extname(filename))
       [key, load_yaml(File.join(CHARACTER_ENTRIES_DIR, filename))]
     end
end

def load_options_data
  Dir.children(OPTIONS_DIR)
     .grep(/\.ya?ml\z/)
     .sort
     .to_h do |filename|
       key = File.basename(filename, File.extname(filename))
       [key, load_yaml(File.join(OPTIONS_DIR, filename))]
     end
end

def external_asset?(path)
  path.match?(%r{\A(?:[a-z][a-z0-9+.-]*:)?//}i) || path.start_with?("data:")
end

def fail_with(message)
  warn "character data validation failed:"
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

def power_variant_id_sets(powers)
  Array(powers).each_with_object({}) do |power, memo|
    next unless power.is_a?(Hash)

    memo[power["id"]] = id_set(power["variants"])
  end
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

def validate_ref_list(context, values, allowed, label, allow_blank: false)
  return [] if values.nil?
  return ["#{context} must be a list"] unless values.is_a?(Array)

  validate_refs(context, values, allowed, label, allow_blank: allow_blank)
end

def array_field(context, value, errors)
  return [] if value.nil?
  return value if value.is_a?(Array)

  errors << "#{context} must be a list"
  []
end

def validate_ranked_stat(context, stat, allowed_values, stat_modifiers, allow_null: false)
  return [] if allow_null && stat.nil?

  errors = []

  if stat.is_a?(String)
    value = stat
    modifier = "normal"
  elsif stat.is_a?(Hash)
    value = stat["value"]
    modifier = stat.fetch("modifier", "normal")

    %w[label note].each do |field|
      next unless stat.key?(field)
      next if stat[field].nil? || stat[field].is_a?(String)

      errors << "#{context}.#{field} must be a string when present"
    end

    unless stat["resistible"].nil? || [true, false].include?(stat["resistible"])
      errors << "#{context}.resistible must be true or false when present"
    end
  else
    return ["#{context} must be a ranked stat map or tier id string"]
  end

  errors.concat(validate_refs("#{context}.value", [value], allowed_values, "tier"))
  errors.concat(validate_refs("#{context}.modifier", [modifier], stat_modifiers, "stat modifier"))
  errors
end

def validate_speed_stat(context, stat, allowed_values, stat_modifiers, allow_null: false)
  errors = validate_ranked_stat(context, stat, allowed_values, stat_modifiers, allow_null: allow_null)
  return errors if allow_null && stat.nil?

  if stat.is_a?(Hash) && stat.key?("label")
    errors << "#{context}.label is not allowed; use one of the fixed speed fields instead"
  end

  errors
end

def validate_stat_effects(context, stat_effects, sets)
  return ["#{context} must be a map"] unless stat_effects.is_a?(Hash)

  errors = []

  stat_effects.each do |stat_name, value|
    catalog = STAT_CATALOGS[stat_name]

    unless catalog
      errors << "#{context}.#{stat_name} is not a known stat effect"
      next
    end

    if catalog == :speed_tiers
      errors.concat(validate_speed_stat("#{context}.#{stat_name}", value, sets[catalog], sets[:stat_modifiers], allow_null: true))
    else
      errors.concat(validate_ranked_stat("#{context}.#{stat_name}", value, sets[catalog], sets[:stat_modifiers], allow_null: true))
    end
  end

  errors
end

def validate_stat_modifier_floor_effects(context, effects, sets)
  return ["#{context} must be a list"] unless effects.is_a?(Array)

  errors = []

  effects.each_with_index do |effect, index|
    effect_context = "#{context}[#{index}]"

    unless effect.is_a?(Hash)
      errors << "#{effect_context} must be a map"
      next
    end

    stat = effect["stat"]
    unless STAT_CATALOGS.key?(stat)
      errors << "#{effect_context}.stat #{stat.inspect} is not a ranked stat field"
    end

    errors.concat(validate_refs("#{effect_context}.modifier", [effect["modifier"]], sets[:stat_modifiers], "stat modifier"))
  end

  errors
end

def validate_derived_power_rule(context, rule, sets)
  return ["#{context} must be a map"] unless rule.is_a?(Hash)

  errors = []
  requirements = rule["requirements"]
  min_matches = rule["min_matches"]

  errors << "#{context} is missing id" if rule["id"].nil? || rule["id"].to_s.empty?
  errors.concat(validate_refs("#{context}.power_id", [rule["power_id"]], sets[:powers], "power"))

  unless requirements.is_a?(Array) && requirements.any?
    errors << "#{context}.requirements must contain at least one requirement"
    requirements = []
  end

  unless min_matches.is_a?(Integer) && min_matches.positive?
    errors << "#{context}.min_matches must be a positive integer"
  end

  if min_matches.is_a?(Integer) && requirements.any? && min_matches > requirements.length
    errors << "#{context}.min_matches cannot be greater than requirement count"
  end

  requirements.each_with_index do |requirement, index|
    requirement_context = "#{context}.requirements[#{index}]"

    unless requirement.is_a?(Hash)
      errors << "#{requirement_context} must be a map"
      next
    end

    stat = requirement["stat"]
    catalog = STAT_CATALOGS[stat]
    unless catalog
      errors << "#{requirement_context}.stat #{stat.inspect} is not a ranked stat field"
      next
    end

    comparison = requirement["comparison"] || "at-least"
    unless %w[at-least at-most exact].include?(comparison)
      errors << "#{requirement_context}.comparison must be at-least, at-most, or exact"
    end

    stat_requirement = {
      "value" => requirement["value"],
      "modifier" => requirement["modifier"] || "normal"
    }
    errors.concat(validate_ranked_stat(requirement_context, stat_requirement, sets[catalog], sets[:stat_modifiers]))
  end

  errors
end

def validate_images(context, images, entry_id: nil)
  return ["#{context} must be a list"] unless images.is_a?(Array)

  errors = []

  images.each_with_index do |image, index|
    image_context = "#{context}[#{index}]"

    unless image.is_a?(Hash)
      errors << "#{image_context} must be a map"
      next
    end

    errors << "#{image_context}.name must be present" if image["name"].nil? || image["name"].to_s.empty?
    image_path = image["image"]

    if image_path.nil? || image_path.to_s.empty?
      errors << "#{image_context}.image must be present"
      next
    end

    image_path = image_path.to_s
    next if external_asset?(image_path)

    normalized_path = image_path.delete_prefix("/")
    expected_prefix = entry_id && entry_id != "empty" ? "assets/images/characters/#{entry_id}/" : "assets/images/characters/"

    unless normalized_path.start_with?(expected_prefix)
      errors << "#{image_context}.image local path must start with #{expected_prefix.inspect}"
      next
    end

    absolute_path = File.join(ROOT, normalized_path)
    errors << "#{image_context}.image local file does not exist at #{normalized_path.inspect}" unless File.file?(absolute_path)
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
    errors.concat(validate_ref_list("#{ref_context}.type_ids", ref["type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_refs("#{ref_context}.martial_arts_degree_id", [ref["martial_arts_degree_id"]], sets[:martial_arts_degrees], "martial arts degree"))
    errors.concat(validate_refs("#{ref_context}.acrobatics_degree_id", [ref["acrobatics_degree_id"]], sets[:acrobatics_degrees], "acrobatics degree"))
    errors.concat(validate_refs("#{ref_context}.magic_level_id", [ref["magic_level_id"]], sets[:magic_levels], "magic level"))
    errors.concat(validate_ref_list("#{ref_context}.magic_nature_ids", ref["magic_nature_ids"], sets[:magic_natures], "magic nature"))

    if ref["source_variant"]
      variant_ids = sets[:power_variant_ids_by_power_id][ref["id"]] || Set.new
      errors.concat(validate_refs("#{ref_context}.source_variant", [ref["source_variant"]], variant_ids, "power variant"))
    end

    errors.concat(validate_power_type_ownership(ref_context, ref, sets))

    validate_effect_list("#{ref_context}.effects", ref["effects"], sets, errors)
  end

  errors
end

def validate_power_type_ownership(context, ref, sets)
  Array(ref["type_ids"]).filter_map do |type_id|
    power_id = sets[:power_type_power_ids][type_id]
    next if power_id.nil? || ref["id"].nil?
    next if power_id == ref["id"]

    "#{context}.type_ids contains #{type_id.inspect}, which belongs to #{power_id.inspect}, not #{ref["id"].inspect}"
  end
end

def validate_power_target_refs(context, refs, sets)
  return ["#{context} must be a list"] unless refs.is_a?(Array)

  refs.each_with_index.flat_map do |ref, index|
    ref_context = "#{context}[#{index}]"

    unless ref.is_a?(Hash)
      next ["#{ref_context} must be a map"]
    end

    errors = validate_refs("#{ref_context}.id", [ref["id"]], sets[:powers], "power") +
             validate_ref_list("#{ref_context}.type_ids", ref["type_ids"], sets[:power_types], "power type") +
             validate_power_type_ownership(ref_context, ref, sets)

    errors
  end
end

def validate_grants(context, grants, sets)
  return [] if grants.nil?
  return ["#{context} must be a map"] unless grants.is_a?(Hash)

  errors = []

  errors.concat(validate_power_refs("#{context}.power_refs", grants["power_refs"] || [], sets))
  errors.concat(validate_resistance_refs("#{context}.resistance_refs", grants["resistance_refs"] || [], sets))
  errors.concat(validate_ref_list("#{context}.magic_level_ids", grants["magic_level_ids"], sets[:magic_levels], "magic level"))
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
    errors.concat(validate_ref_list("#{ref_context}.type_ids", ref["type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_refs("#{ref_context}.magic_level_id", [ref["magic_level_id"]], sets[:magic_levels], "magic level"))
    errors.concat(validate_ref_list("#{ref_context}.magic_nature_ids", ref["magic_nature_ids"], sets[:magic_natures], "magic nature"))
  end

  errors
end

def validate_equipment_refs(context, refs, sets)
  return [] if refs.nil?
  return ["#{context} must be a list"] unless refs.is_a?(Array)

  errors = []

  refs.each_with_index do |ref, index|
    ref_context = "#{context}[#{index}]"

    unless ref.is_a?(Hash)
      errors << "#{ref_context} must be a map"
      next
    end

    errors.concat(validate_refs("#{ref_context}.id", [ref["id"]], sets[:equipment], "equipment"))
    validate_effect_list("#{ref_context}.effects", ref["effects"], sets, errors)
  end

  errors
end

def validate_effect(context, effect, sets)
  return ["#{context} must be a map"] unless effect.is_a?(Hash)

  errors = []

  if effect.key?("grants")
    errors.concat(validate_grants("#{context}.grants", effect["grants"], sets))
  end

  if effect.key?("stat_effects")
    errors.concat(validate_stat_effects("#{context}.stat_effects", effect["stat_effects"], sets))
  end

  if effect.key?("stat_modifier_floor_effects")
    errors.concat(validate_stat_modifier_floor_effects("#{context}.stat_modifier_floor_effects", effect["stat_modifier_floor_effects"], sets))
  end

  if effect.key?("power_nullification")
    nullification = effect["power_nullification"]

    unless nullification.is_a?(Hash)
      errors << "#{context}.power_nullification must be a map"
    else
      errors.concat(validate_ref_list("#{context}.power_nullification.target_power_ids", nullification["target_power_ids"], sets[:powers], "power"))
      errors.concat(validate_refs("#{context}.power_nullification.max_target_modifier", [nullification["max_target_modifier"]], sets[:ability_modifiers], "ability modifier"))
    end
  end

  if effect.key?("absorption")
    absorption = effect["absorption"]

    unless absorption.is_a?(Hash)
      errors << "#{context}.absorption must be a map"
    else
      target_refs = absorption["target_power_refs"]
      if !target_refs.is_a?(Array) || target_refs.empty?
        errors << "#{context}.absorption.target_power_refs must list at least one target power"
      else
        errors.concat(validate_power_target_refs("#{context}.absorption.target_power_refs", target_refs, sets))
      end
    end
  end

  if effect.key?("resistance_negation")
    negation = effect["resistance_negation"]

    unless negation.is_a?(Hash)
      errors << "#{context}.resistance_negation must be a map"
    else
      errors.concat(validate_ref_list("#{context}.resistance_negation.target_resistance_ids", negation["target_resistance_ids"], sets[:resistances], "resistance"))
      errors.concat(validate_ref_list("#{context}.resistance_negation.target_immunity_ids", negation["target_immunity_ids"], sets[:resistances], "resistance"))
    end
  end

  if effect.key?("non_physical_interaction")
    interaction = effect["non_physical_interaction"]

    unless interaction.is_a?(Hash)
      errors << "#{context}.non_physical_interaction must be a map"
    else
      errors.concat(validate_power_target_refs("#{context}.non_physical_interaction.target_power_refs", interaction["target_power_refs"] || [], sets))
    end
  end

  if effect.key?("image_update")
    errors.concat(validate_image_update("#{context}.image_update", effect["image_update"]))
  end

  if effect.key?("nullified_by")
    nullified_by = effect["nullified_by"]

    unless nullified_by.is_a?(Hash)
      errors << "#{context}.nullified_by must be a map"
    else
      errors.concat(validate_power_refs("#{context}.nullified_by.power_refs", nullified_by["power_refs"] || [], sets))
      errors.concat(validate_resistance_refs("#{context}.nullified_by.resistance_refs", nullified_by["resistance_refs"] || [], sets))
    end
  end

  errors
end

def validate_effect_list(context, effects, sets, errors)
  array_field(context, effects, errors).each_with_index do |effect, index|
    errors.concat(validate_effect("#{context}[#{index}]", effect, sets))
  end
end

def validate_image_update(context, image_update)
  return ["#{context} must be a map"] unless image_update.is_a?(Hash)

  errors = []

  errors << "#{context}.name must be present" if image_update["name"].nil? || image_update["name"].to_s.empty?
  errors << "#{context}.image must be present" if image_update["image"].nil? || image_update["image"].to_s.empty?

  unless image_update["priority"].nil? || image_update["priority"].is_a?(Integer)
    errors << "#{context}.priority must be an integer when present"
  end

  unless image_update["condition"].nil? || image_update["condition"].is_a?(String)
    errors << "#{context}.condition must be a string when present"
  end

  errors
end

def validate_power_variant(context, variant, seen_variant_ids, sets)
  errors = []

  unless variant.is_a?(Hash)
    return ["#{context} must be a map"]
  end

  variant_id = variant["id"]
  if variant_id.nil? || variant_id.to_s.empty?
    errors << "#{context}.id must be present"
  elsif seen_variant_ids.key?(variant_id)
    variants_context = context.sub(/\.variants\[\d+\]\z/, ".variants")
    errors << "#{variants_context} has duplicate id #{variant_id.inspect}"
  else
    seen_variant_ids[variant_id] = true
  end

  unless variant["inherits_base_grants"].nil? || [true, false].include?(variant["inherits_base_grants"])
    errors << "#{context}.inherits_base_grants must be true or false when present"
  end

  unless variant["display_as_power_name"].nil? || [true, false].include?(variant["display_as_power_name"])
    errors << "#{context}.display_as_power_name must be true or false when present"
  end

  errors.concat(validate_grants("#{context}.grants", variant["grants"], sets))
  validate_effect_list("#{context}.effects", variant["effects"], sets, errors)
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
    errors.concat(validate_ref_list("#{context}.covers_type_ids", entry["covers_type_ids"], sets[:power_types], "power type"))
  when :power
    errors.concat(validate_ref_list("#{context}.type_ids", entry["type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_ref_list("#{context}.degree_ids", entry["degree_ids"], sets[:martial_arts_degrees] | sets[:acrobatics_degrees], "degree"))
    seen_variant_ids = {}

    array_field("#{context}.variants", entry["variants"], errors).each_with_index do |variant, index|
      errors.concat(validate_power_variant("#{context}.variants[#{index}]", variant, seen_variant_ids, sets))
    end
    if entry.key?("grants")
      errors.concat(validate_grants("#{context}.grants", entry["grants"], sets))
    end
  when :resistance
    errors.concat(validate_ref_list("#{context}.resists_power_ids", entry["resists_power_ids"], sets[:powers], "power"))
  when :magic_level
    errors.concat(validate_ref_list("#{context}.inherits_level_ids", entry["inherits_level_ids"], sets[:magic_levels], "magic level"))
    errors.concat(validate_power_refs("#{context}.power_refs", entry["power_refs"] || [], sets))
    errors.concat(validate_resistance_refs("#{context}.resistance_refs", entry["resistance_refs"] || [], sets))
  when :magic_nature
    errors.concat(validate_ref_list("#{context}.inherits_nature_ids", entry["inherits_nature_ids"], sets[:magic_natures], "magic nature"))
    errors.concat(validate_power_refs("#{context}.power_refs", entry["power_refs"] || [], sets))
    errors.concat(validate_resistance_refs("#{context}.resistance_refs", entry["resistance_refs"] || [], sets))
  when :equipment, :attack
    errors.concat(validate_ref_list("#{context}.weapon_type_ids", entry["weapon_type_ids"], sets[:power_types], "power type"))
    errors.concat(validate_power_refs("#{context}.required_power_refs", entry["required_power_refs"] || [], sets))
  end

  validate_effect_list("#{context}.effects", entry["effects"], sets, errors)

  errors
end

def validate_character(context, character, sets, entry_id: nil)
  return ["#{context} must be a map"] unless character.is_a?(Hash)

  errors = []
  keys = character["keys"]

  if entry_id && !entry_id.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/)
    errors << "#{context} entry id #{entry_id.inspect} must use lowercase letters, numbers, and hyphens"
  end

  errors.concat(validate_refs("#{context}.verse_id", [character["verse_id"]], sets[:verses], "verse", allow_blank: true))
  errors.concat(validate_refs("#{context}.gender_id", [character["gender_id"]], sets[:genders], "gender"))
  errors.concat(validate_ref_list("#{context}.classification_ids", character["classification_ids"], sets[:classifications], "classification"))

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
      errors << "#{key_context}.key must be present"
    elsif seen_keys.key?(key_id)
      errors << "#{context}.keys has duplicate key #{key_id.inspect}"
    else
      seen_keys[key_id] = true
    end

    errors.concat(validate_images("#{key_context}.images", key["images"] || [], entry_id: entry_id))
    errors.concat(validate_power_refs("#{key_context}.power_refs", key["power_refs"] || [], sets))
    errors.concat(validate_resistance_refs("#{key_context}.resistance_refs", key["resistance_refs"] || [], sets))
    errors.concat(validate_ref_list("#{key_context}.standard_equipment_ids", key["standard_equipment_ids"], sets[:equipment], "equipment"))
    errors.concat(validate_equipment_refs("#{key_context}.standard_equipment_refs", key["standard_equipment_refs"], sets))
    errors.concat(validate_ref_list("#{key_context}.optional_equipment_ids", key["optional_equipment_ids"], sets[:equipment], "equipment"))
    errors.concat(validate_equipment_refs("#{key_context}.optional_equipment_refs", key["optional_equipment_refs"], sets))
    errors.concat(validate_ref_list("#{key_context}.attack_ids", key["attack_ids"], sets[:attacks], "attack"))

    errors.concat(validate_ranked_stat("#{key_context}.attack_potency", key["attack_potency"], sets[:attack_durability_tiers], sets[:stat_modifiers]))
    errors.concat(validate_speed_stat("#{key_context}.attack_speed", key["attack_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_speed_stat("#{key_context}.combat_speed", key["combat_speed"], sets[:speed_tiers], sets[:stat_modifiers]))
    errors.concat(validate_speed_stat("#{key_context}.reaction_speed", key["reaction_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_speed_stat("#{key_context}.travel_speed", key["travel_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_speed_stat("#{key_context}.flight_speed", key["flight_speed"], sets[:speed_tiers], sets[:stat_modifiers], allow_null: true))
    errors.concat(validate_ranked_stat("#{key_context}.lifting_strength", key["lifting_strength"], sets[:lifting_strength_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.striking_strength", key["striking_strength"], sets[:striking_strength_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.durability", key["durability"], sets[:attack_durability_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.stamina", key["stamina"], sets[:stamina_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.range", key["range"], sets[:range_tiers], sets[:stat_modifiers]))
    errors.concat(validate_ranked_stat("#{key_context}.intelligence", key["intelligence"], sets[:intelligence_tiers], sets[:stat_modifiers]))
  end

  errors
end

data = load_characters_data
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
  derived_power_rules
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
sets[:power_variant_ids_by_power_id] = power_variant_id_sets(options["powers"])
sets[:power_type_power_ids] = Array(options["power_types"]).filter_map do |entry|
  [entry["id"], entry["power_id"]] if entry.is_a?(Hash)
end.to_h

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

Array(options["derived_power_rules"]).each_with_index do |entry, index|
  errors.concat(validate_derived_power_rule("options.derived_power_rules[#{index}]", entry, sets))
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

characters = data["characters"]

if characters.nil?
  errors << "characters must be present"
elsif !characters.is_a?(Array)
  errors << "characters must be a list"
else
  characters.each_with_index do |character, index|
    context = "characters[#{index}]"
    entry_id = character["entry_id"] if character.is_a?(Hash)

    if character.is_a?(Hash)
      name = character["name"]

      errors << "#{context}.name must be present" if name.nil? || name.to_s.empty?
    end

    errors.concat(validate_character(context, character, sets, entry_id: entry_id))
  end
end

if errors.any?
  fail_with(errors.map { |error| "- #{error}" }.join("\n"))
end

puts "character data validation passed"
