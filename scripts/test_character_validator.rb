#!/usr/bin/env ruby
# frozen_string_literal: true

require "set"

load File.expand_path("validate_characters.rb", __dir__)

def assert_errors(label, errors)
  return if errors.any?

  abort "character validator tests failed: #{label} was accepted"
end

assert_errors("an empty effect", validate_effect("effect", {}, {}))
assert_errors("an unknown effect field", validate_effect("effect", { "stat_effect" => {} }, {}))
assert_errors(
  "a ranked stat without a value",
  validate_ranked_stat("stat", { "modifier" => "normal" }, Set.new, Set["normal"])
)
assert_errors(
  "a missing local image update",
  validate_image_update(
    "image_update",
    {
      "name" => "Missing image",
      "image" => "assets/images/characters/missing.webp"
    }
  )
)
assert_errors(
  "an image path outside the character asset tree",
  validate_local_image_path(
    "image",
    "assets/images/characters/example/../../../../AGENTS.md"
  )
)

locked_stat_errors = validate_ranked_stat(
  "stat",
  { "value" => "inapplicable", "modifier" => nil },
  Set["inapplicable"],
  Set["normal"],
  locked_values: Set["inapplicable"]
)
abort "character validator tests failed: modifier null did not default to normal" if locked_stat_errors.any?

puts "character validator tests passed"
