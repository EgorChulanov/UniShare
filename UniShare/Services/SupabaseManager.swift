import Foundation
import Supabase

final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    // Fallback JWT used only when Secrets.xcconfig values aren't resolved.
    // It is syntactically valid (3-part JWT) so the SDK won't crash,
    // but it won't authenticate against any real project.
    private static let placeholderKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
        ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0" +
        ".cGxhY2Vob2xkZXI"

    private init() {
        let urlString = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String ?? ""
        let key       = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String ?? ""

        // Detect unresolved xcconfig variables like "$(SUPABASE_URL)"
        let validURL = urlString.hasPrefix("https://")
            ? URL(string: urlString)!
            : URL(string: "https://placeholder.supabase.co")!

        // A valid Supabase JWT always has exactly 3 dot-separated parts
        let validKey = key.components(separatedBy: ".").count == 3
            ? key
            : Self.placeholderKey

        if !urlString.hasPrefix("https://") || key.components(separatedBy: ".").count != 3 {
            print("⚠️ SupabaseManager: credentials not resolved.")
            print("   SUPABASE_URL = '\(urlString)'")
            print("   Fix: run 'make generate' from the project root, then clean-build in Xcode.")
        }

        client = SupabaseClient(supabaseURL: validURL, supabaseKey: validKey)
    }
}
