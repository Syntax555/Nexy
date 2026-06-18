#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "optparse"
require "open3"
require "shellwords"

ROOT = File.expand_path("..", __dir__)
DEFAULT_SOURCE = File.join(ROOT, "assets", "images", "characters")
IMAGE_EXTENSIONS = %w[.png .jpg .jpeg .webp].freeze

def usage
  <<~TEXT
    Usage:
      ruby scripts/trim_character_images.rb --check
      ruby scripts/trim_character_images.rb [--source assets/images/characters] --out tmp/trimmed-images [--dry-run]

    Uses ImageMagick's `magick` command to trim transparent/solid empty borders.
    This is an optional asset-maintenance helper and is not required by Jekyll.
  TEXT
end

def find_magick
  return ENV["MAGICK"] if ENV["MAGICK"] && !ENV["MAGICK"].empty?

  command = Gem.win_platform? ? "where magick" : "command -v magick"
  stdout, _stderr, status = Open3.capture3(command)
  return nil unless status.success?

  stdout.lines.first&.strip
end

def image_files(root)
  Dir.glob(File.join(root, "**", "*"))
     .select { |path| File.file?(path) && IMAGE_EXTENSIONS.include?(File.extname(path).downcase) }
     .sort
end

options = {
  check: false,
  dry_run: false,
  source: DEFAULT_SOURCE,
  out: nil
}

OptionParser.new do |opts|
  opts.banner = usage
  opts.on("--check", "Check whether ImageMagick is available") { options[:check] = true }
  opts.on("--dry-run", "Print planned output paths without writing") { options[:dry_run] = true }
  opts.on("--source PATH", "Source image tree") { |path| options[:source] = File.expand_path(path, ROOT) }
  opts.on("--out PATH", "Output image tree") { |path| options[:out] = File.expand_path(path, ROOT) }
  opts.on("-h", "--help", "Show this help") do
    puts usage
    exit 0
  end
end.parse!

magick = find_magick

if options[:check]
  if magick
    puts "ImageMagick available: #{magick}"
  else
    puts "ImageMagick `magick` command was not found. Install ImageMagick to use offline trimming."
  end
  exit 0
end

abort "Missing --out PATH. Refusing to overwrite original character images." unless options[:out]
abort "ImageMagick `magick` command was not found. Run with --check for details." unless magick
abort "Source directory does not exist: #{options[:source]}" unless Dir.exist?(options[:source])

files = image_files(options[:source])
abort "No images found under #{options[:source]}" if files.empty?

files.each do |source|
  relative = source.delete_prefix(options[:source]).sub(%r{\A[\\/]+}, "")
  destination = File.join(options[:out], relative)

  if options[:dry_run]
    puts "#{source} -> #{destination}"
    next
  end

  FileUtils.mkdir_p(File.dirname(destination))
  command = [
    magick,
    source,
    "-trim",
    "+repage",
    destination
  ]
  stdout, stderr, status = Open3.capture3(*command)
  unless status.success?
    warn stdout unless stdout.empty?
    warn stderr unless stderr.empty?
    abort "failed to trim #{source}"
  end
end

puts "trimmed #{files.length} image(s) into #{options[:out]}"
