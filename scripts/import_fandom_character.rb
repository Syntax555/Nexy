#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "net/http"
require "optparse"
require "time"
require "uri"
require "yaml"
require "fileutils"

ROOT = File.expand_path("..", __dir__)
FANDOM_API = "https://vsbattles.fandom.com/api.php"

STAT_LABELS = {
  "name" => /\bname\b/i,
  "tier" => /\btier\b/i,
  "gender" => /\bgender\b/i,
  "age" => /\bage\b/i,
  "classification" => /\bclassifications?\b/i,
  "powers" => /\bpowers?(?:\s+and\s+abilities)?\b/i,
  "attack_potency" => /\battack\s+potency\b/i,
  "speed" => /\bspeed\b/i,
  "lifting_strength" => /\blifting\s+strength\b/i,
  "striking_strength" => /\bstriking\s+strength\b/i,
  "durability" => /\bdurability\b/i,
  "stamina" => /\bstamina\b/i,
  "range" => /\brange\b/i,
  "standard_equipment" => /\bstandard\s+equipment\b/i,
  "intelligence" => /\bintelligence\b/i,
  "weaknesses" => /\bweaknesses\b/i
}.freeze

def usage
  <<~TEXT
    Usage:
      ruby scripts/import_fandom_character.rb PAGE_URL_OR_TITLE [--out tmp/draft.yml]

    Creates a review draft from the public MediaWiki API. It does not modify Nexy
    character data because VS Battles pages still need manual mapping and checking.
  TEXT
end

def title_from_input(input)
  return input unless input.match?(%r{\Ahttps?://}i)

  uri = URI(input)
  parts = uri.path.split("/")
  wiki_index = parts.index("wiki")
  title = wiki_index ? parts[wiki_index + 1] : parts.last
  URI.decode_www_form_component(title.to_s).tr("_", " ")
end

def fetch_json(url, params)
  uri = URI(url)
  uri.query = URI.encode_www_form(params)
  response = Net::HTTP.get_response(uri)
  raise "HTTP #{response.code} while requesting #{uri}" unless response.is_a?(Net::HTTPSuccess)

  JSON.parse(response.body)
end

def fetch_page_payload(title)
  fetch_json(
    FANDOM_API,
    {
      action: "query",
      titles: title,
      prop: "revisions|images|info",
      rvprop: "content",
      rvslots: "main",
      inprop: "url",
      imlimit: "max",
      format: "json",
      formatversion: "2"
    }
  )
end

def page_from_payload(payload)
  Array(payload.dig("query", "pages")).first || {}
end

def revision_content(page)
  revision = Array(page["revisions"]).first || {}
  revision.dig("slots", "main", "content") || revision["content"] || ""
end

def clean_wiki_value(value)
  value.to_s
       .gsub(/<ref\b.*?<\/ref>/im, "")
       .gsub(/<ref\b[^>]*\/>/im, "")
       .gsub(/\{\{.*?\}\}/m, "")
       .gsub(/\[\[([^|\]]+)\|([^\]]+)\]\]/, '\2')
       .gsub(/\[\[([^\]]+)\]\]/, '\1')
       .gsub(/'{2,}/, "")
       .gsub(/<[^>]+>/, "")
       .gsub(/\s+/, " ")
       .strip
end

def candidate_from_table_line(line)
  line.match(/\A\|\s*([^=]+?)\s*=\s*(.+)\z/)
end

def candidate_from_bold_line(line)
  line.match(/\A\*?\s*'{2,}([^']+)'{2,}\s*:?\s*(.+)\z/)
end

def extract_candidates(wikitext)
  candidates = Hash.new { |hash, key| hash[key] = [] }

  wikitext.each_line do |line|
    stripped = line.strip
    match = candidate_from_table_line(stripped) || candidate_from_bold_line(stripped)
    next unless match

    label = clean_wiki_value(match[1])
    value = clean_wiki_value(match[2])
    next if label.empty? || value.empty?

    STAT_LABELS.each do |key, pattern|
      next unless label.match?(pattern)

      candidates[key] << value
      break
    end
  end

  candidates.transform_values { |values| values.uniq.first(5) }
end

options = {
  out: nil
}

parser = OptionParser.new do |opts|
  opts.banner = usage
  opts.on("--out PATH", "Write draft YAML to PATH") { |path| options[:out] = path }
  opts.on("-h", "--help", "Show this help") do
    puts usage
    exit 0
  end
end

parser.parse!
input = ARGV.shift
abort usage unless input

page_title = title_from_input(input)
payload = fetch_page_payload(page_title)
page = page_from_payload(payload)
abort "Page not found: #{page_title}" if page["missing"]

wikitext = revision_content(page)
draft = {
  "source" => {
    "url" => page["fullurl"] || input,
    "page_title" => page["title"] || page_title,
    "fetched_at" => Time.now.utc.iso8601,
    "importer" => "scripts/import_fandom_character.rb"
  },
  "raw_candidates" => extract_candidates(wikitext),
  "page_images" => Array(page["images"]).map { |image| image["title"] }.compact.sort,
  "draft_character" => {
    "name" => page["title"] || page_title,
    "verse_id" => "",
    "gender_id" => "",
    "age" => {
      "value" => nil,
      "unknown" => true,
      "display" => nil
    },
    "classification_ids" => [],
    "keys" => []
  },
  "notes" => [
    "This is a draft only. Map all ids to _data/characters/options/*.yml manually.",
    "Only keep powers, equipment, and effects that Nexy currently implements.",
    "Verify every imported value against the source before adding it to character entries."
  ]
}

out_path = options[:out] || File.join(ROOT, "tmp", "#{page_title.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-+\z/, "")}-draft.yml")
FileUtils.mkdir_p(File.dirname(out_path))
File.write(out_path, YAML.dump(draft))
puts "wrote #{out_path}"
