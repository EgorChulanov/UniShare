#!/usr/bin/env ruby
# frozen_string_literal: true
require "uri"


ROOT = File.expand_path("..", __dir__)
METADATA_ROOT = File.join(ROOT, "fastlane", "metadata")

LIMITS = {
  "name.txt" => 30,
  "subtitle.txt" => 30,
  "keywords.txt" => 100,
  "promotional_text.txt" => 170,
  "description.txt" => 4_000
}.freeze

REQUIRED_URL_FILES = %w[privacy_url.txt support_url.txt].freeze
FORBIDDEN_COPY = [
  /account\s+(exchange|sharing|sale|trade)/i,
  /(exchange|share|sell|trade)\s+(gaming\s+)?accounts?/i,
  /subscription\s+sharing/i,
  /artificial intelligence/i,
  /\bAI assistant\b/i
].freeze

errors = []
locales = Dir.children(METADATA_ROOT).select do |entry|
  File.directory?(File.join(METADATA_ROOT, entry))
end.sort

errors << "No App Store metadata locales found" if locales.empty?

locales.each do |locale|
  directory = File.join(METADATA_ROOT, locale)

  LIMITS.each do |filename, limit|
    path = File.join(directory, filename)
    unless File.file?(path)
      errors << "#{locale}/#{filename}: missing"
      next
    end

    value = File.read(path, encoding: "UTF-8").strip
    errors << "#{locale}/#{filename}: empty" if value.empty?
    errors << "#{locale}/#{filename}: #{value.length} characters exceeds #{limit}" if value.length > limit

    if filename == "keywords.txt"
      errors << "#{locale}/#{filename}: must be a comma-separated list without spaces after commas" if value.include?(", ")
      errors << "#{locale}/#{filename}: duplicate keyword" if value.split(",").map(&:downcase).uniq.length != value.split(",").length
    end

    FORBIDDEN_COPY.each do |pattern|
      errors << "#{locale}/#{filename}: forbidden product positioning matches #{pattern.inspect}" if value.match?(pattern)
    end
  end

  REQUIRED_URL_FILES.each do |filename|
    path = File.join(directory, filename)
    unless File.file?(path)
      errors << "#{locale}/#{filename}: missing"
      next
    end

    value = File.read(path, encoding: "UTF-8").strip
    begin
      uri = URI.parse(value)
      errors << "#{locale}/#{filename}: must be an HTTPS URL with a host" unless uri.is_a?(URI::HTTPS) && uri.host
    rescue URI::InvalidURIError
      errors << "#{locale}/#{filename}: invalid URL"
    end
  end
end

if errors.empty?
  puts "App Store metadata validated for #{locales.length} locales"
else
  warn errors.join("\n")
  exit 1
end
