#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

ROOT = File.expand_path("..", __dir__)
FIXTURE_PATH = File.join(ROOT, "test", "fixtures", "battle_rules.yml")
WINNERS = %w[left right tie].freeze
STATUSES = %w[active disabled absorbed negated nullified resisted].freeze
REQUIRED_SCORE_EXPECTATIONS = %w[left_score right_score score_gap winner].freeze

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

    {
      "left_rank" => stat.fetch("left_rank"),
      "right_rank" => stat.fetch("right_rank"),
      "winner" => winner
    }
  end

  left_score = rows.sum { |row| row["left_rank"] }
  right_score = rows.sum { |row| row["right_rank"] }
  point_winner = winner_for(left_score, right_score)
  tie_breakers = test_case["tie_breakers"] || [test_case["tie_breaker"]].compact
  tie_breaker_winner = nil
  tie_breaker_label = nil
  interaction_winner = test_case.dig("interaction", "winner")

  if interaction_winner.nil? && point_winner == "tie"
    active_tie_breaker = tie_breakers.find do |tie_breaker|
      winner_for(tie_breaker.fetch("left_rank"), tie_breaker.fetch("right_rank")) != "tie"
    end

    if active_tie_breaker
      tie_breaker_winner = winner_for(active_tie_breaker.fetch("left_rank"), active_tie_breaker.fetch("right_rank"))
      tie_breaker_label = active_tie_breaker["label"]
    end
  end

  {
    "left_score" => left_score,
    "right_score" => right_score,
    "score_gap" => (left_score - right_score).abs,
    "winner" => interaction_winner || (tie_breaker_winner && tie_breaker_winner != "tie" ? tie_breaker_winner : point_winner),
    "tie_breaker_winner" => tie_breaker_winner,
    "tie_breaker_label" => tie_breaker_label,
    "interaction_winner" => interaction_winner
  }
end

def validate_score_case(test_case)
  return ["score case must be a map"] unless test_case.is_a?(Hash)

  errors = []
  id = test_case["id"]
  stats = test_case["stats"]
  expected = test_case["expected"]
  errors << "score case id must be present" if id.to_s.empty?
  errors << "#{id}.stats must contain at least one stat" unless stats.is_a?(Array) && stats.any?
  errors << "#{id}.expected must be a non-empty map" unless expected.is_a?(Hash) && expected.any?

  if stats.is_a?(Array)
    stats.each_with_index do |stat, index|
      context = "#{id}.stats[#{index}]"
      unless stat.is_a?(Hash)
        errors << "#{context} must be a map"
        next
      end

      errors << "#{context}.label must be present" if stat["label"].to_s.empty?
      %w[left_rank right_rank].each do |field|
        errors << "#{context}.#{field} must be an integer" unless stat[field].is_a?(Integer)
      end
      if stat.key?("scored") && ![true, false].include?(stat["scored"])
        errors << "#{context}.scored must be true or false"
      end
      if stat["expected_winner"] && !WINNERS.include?(stat["expected_winner"])
        errors << "#{context}.expected_winner must be left, right, or tie"
      end
      if stat.key?("expected_rank_gap") && (!stat["expected_rank_gap"].is_a?(Integer) || stat["expected_rank_gap"].negative?)
        errors << "#{context}.expected_rank_gap must be a non-negative integer"
      end
    end
  end

  if expected.is_a?(Hash)
    missing_expectations = REQUIRED_SCORE_EXPECTATIONS - expected.keys
    errors.concat(missing_expectations.map { |key| "#{id}.expected is missing #{key}" })
    if expected["winner"] && !WINNERS.include?(expected["winner"])
      errors << "#{id}.expected.winner must be left, right, or tie"
    end
  end

  interaction_winner = test_case.dig("interaction", "winner")
  if interaction_winner && !WINNERS.include?(interaction_winner)
    errors << "#{id}.interaction.winner must be left, right, or tie"
  end

  return errors if errors.any?

  actual = score_case(test_case)
  mismatches = expected.filter_map do |key, value|
    next "#{id}.expected.#{key} is not a supported result field" unless actual.key?(key)
    next if actual[key] == value

    "#{id}.#{key} expected #{value.inspect}, got #{actual[key].inspect}"
  end

  mismatches
end

def validate_status_case(test_case)
  return ["status case must be a map"] unless test_case.is_a?(Hash)

  errors = []
  errors << "status case id must be present" if test_case["id"].to_s.empty?
  errors << "#{test_case["id"]}.kind must be present" if test_case["kind"].to_s.empty?
  errors << "#{test_case["id"]}.status must be present" if test_case["status"].to_s.empty?
  if test_case["status"] && !STATUSES.include?(test_case["status"])
    errors << "#{test_case["id"]}.status must be a known battle status"
  end
  errors << "#{test_case["id"]}.detail must be present" if test_case["detail"].to_s.empty?
  errors
end

fixture = YAML.safe_load_file(FIXTURE_PATH)
fail_with("fixture root must be a map") unless fixture.is_a?(Hash)

score_cases = fixture["score_cases"]
status_cases = fixture["status_cases"]
fail_with("score_cases must contain at least one case") unless score_cases.is_a?(Array) && score_cases.any?
fail_with("status_cases must contain at least one case") unless status_cases.is_a?(Array) && status_cases.any?

errors = []
ids = {}

(score_cases + status_cases).each do |test_case|
  next unless test_case.is_a?(Hash)

  id = test_case["id"]
  next if id.to_s.empty?

  if ids.key?(id)
    errors << "duplicate fixture id #{id.inspect}"
  else
    ids[id] = true
  end
end

score_cases.each do |test_case|
  errors.concat(validate_score_case(test_case))
end

status_cases.each do |test_case|
  errors.concat(validate_status_case(test_case))
end

fail_with(errors.map { |error| "- #{error}" }.join("\n")) if errors.any?

puts "battle fixture tests passed"
