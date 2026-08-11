#!/usr/bin/env ruby
# frozen_string_literal: true

require "set"

root = File.expand_path("..", __dir__)
files = Dir[File.join(root, "UniShare/Localization/*.lproj/Localizable.strings")].sort
abort "No localization files found" if files.empty?

entries = {}
errors = []

files.each do |file|
  pairs = File.read(file).scan(/^"([^"]+)"\s*=\s*"((?:\\.|[^"])*)";/)
  keys = pairs.map(&:first)
  duplicates = keys.group_by(&:itself).select { |_key, values| values.length > 1 }.keys
  errors << "#{file}: duplicate keys: #{duplicates.join(', ')}" unless duplicates.empty?
  entries[file] = pairs.to_h
end

all_keys = entries.values.flat_map(&:keys).to_set
entries.each do |file, values|
  missing = all_keys - values.keys.to_set
  errors << "#{file}: missing keys: #{missing.to_a.sort.join(', ')}" unless missing.empty?
end

all_keys.each do |key|
  formats = entries.transform_values do |values|
    values.fetch(key).scan(/%(?:\d+\$)?[@df]/).sort
  end
  errors << "#{key}: inconsistent format placeholders: #{formats}" if formats.values.uniq.length > 1
end

referenced = Dir[File.join(root, "UniShare/**/*.swift")].flat_map do |file|
  File.read(file).scan(/"([a-z][a-z0-9_.]+)"\.localized/).flatten
end.to_set
missing_references = referenced - all_keys
errors << "Swift references missing localization keys: #{missing_references.to_a.sort.join(', ')}" unless missing_references.empty?

abort errors.join("\n") unless errors.empty?
puts "Localization validation passed: #{all_keys.length} keys across #{files.length} languages"
