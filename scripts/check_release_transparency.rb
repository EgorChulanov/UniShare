#!/usr/bin/env ruby
# frozen_string_literal: true

ROOT = File.expand_path("..", __dir__)
errors = []

def read(root, path)
  File.read(File.join(root, path), encoding: "UTF-8")
end

app_constants = read(ROOT, "UniShare/Core/AppConstants.swift")
supabase_manager = read(ROOT, "UniShare/Services/SupabaseManager.swift")
tab_bar = read(ROOT, "UniShare/Navigation/TabBarView.swift")
release_config = read(ROOT, "Config/Release.xcconfig")
project = read(ROOT, "project.yml")
info_plist = read(ROOT, "UniShare/Info.plist")

unless app_constants.match?(/static var isUITesting: Bool \{\s*#if DEBUG\s*ProcessInfo[\s\S]*?#else\s*false\s*#endif\s*\}/)
  errors << "UI-testing behavior must compile to false outside DEBUG"
end

unless supabase_manager.match?(/#if DEBUG[\s\S]*?UNISHARE_SUPABASE_URL[\s\S]*?#else[\s\S]*?let urlString = bundleURL[\s\S]*?#endif/)
  errors << "Supabase environment overrides must exist only inside DEBUG"
end

errors << "Global shake activation is present" if tab_bar.include?("ShakeDetectionService")
errors << "Motion usage remains in the release project" if project.include?("NSMotionUsageDescription") || info_plist.include?("NSMotionUsageDescription")
errors << "Release configuration defines DEBUG" if release_config.match?(/\bDEBUG\s*=\s*1\b/)

Dir.glob(File.join(ROOT, "UniShare/**/*.{swift,strings}")) do |path|
  next if path.end_with?("ManropeFontSwizzle.swift")
  contents = File.read(path, encoding: "UTF-8")
  errors << "Legacy exchange product identifier remains in #{path.delete_prefix(ROOT + "/")}" if contents.match?(/\bexchange\b/i)
end

if errors.empty?
  puts "Release transparency checks passed"
else
  warn errors.join("\n")
  exit 1
end
