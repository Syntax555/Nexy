#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

ROOT = File.expand_path("..", __dir__)
FIXTURE_PATH = File.join(ROOT, "test", "fixtures", "battle_rules.yml")

def fail_with(message)
  warn "battle fixture tests failed:"
  warn message
  exit 1
end

def winner_for(left_rank, right_rank)
  return "left" if left_rank > right_rank
  return "right" if right_rank > left_rank

  "tie"
end

def score_case(test_case)
  rows = Array(test_case["stats"]).filter_map do |stat|
    next if stat["scored"] == false

    winner = winner_for(stat.fetch("left_rank"), stat.fetch("right_rank"))
    expected_winner = stat["expected_winner"]
    rank_gap = (stat.fetch("left_rank") - stat.fetch("right_rank")).abs
    expected_rank_gap = stat["expected_rank_gap"]

    if expected_winner && winner != expected_winner
      raise "#{test_case["id"]}.#{stat["label"]} expected #{expected_winner}, got #{winner}"
    end

    if expected_rank_gap && rank_gap != expected_rank_gap
      raise "#{test_case["id"]}.#{stat["label"]} expected rank gap #{expected_rank_gap}, got #{rank_gap}"
    end

    winner
  end

  left_score = rows.count("left")
  right_score = rows.count("right")
  {
    "left_score" => left_score,
    "right_score" => right_score,
    "winner" => winner_for(left_score, right_score)
  }
end

def validate_score_case(test_case)
  expected = test_case.fetch("expected")
  actual = score_case(test_case)
  mismatches = expected.filter_map do |key, value|
    next if actual[key] == value

    "#{test_case["id"]}.#{key} expected #{value.inspect}, got #{actual[key].inspect}"
  end

  mismatches
end

def validate_status_case(test_case)
  errors = []
  errors << "#{test_case["id"]}.kind must be present" if test_case["kind"].to_s.empty?
  errors << "#{test_case["id"]}.status must be present" if test_case["status"].to_s.empty?
  errors << "#{test_case["id"]}.detail must be present" if test_case["detail"].to_s.empty?
  errors
end

fixture = YAML.safe_load_file(FIXTURE_PATH)
errors = []

Array(fixture["score_cases"]).each do |test_case|
  errors.concat(validate_score_case(test_case))
end

Array(fixture["status_cases"]).each do |test_case|
  errors.concat(validate_status_case(test_case))
end

fail_with(errors.map { |error| "- #{error}" }.join("\n")) if errors.any?

puts "battle fixture tests passed"
