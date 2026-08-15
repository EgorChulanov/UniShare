import Foundation
import Supabase

final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient
    let isConfigured: Bool
    lazy var database = client.schema("public")

    // Fallback JWT used only when Secrets.xcconfig values aren't resolved.
    // It is syntactically valid (3-part JWT) so the SDK won't crash,
    // but it won't authenticate against any real project.
    private static let placeholderKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
        ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0" +
        ".cGxhY2Vob2xkZXI"

    private static func isAllowedURL(_ url: URL?) -> Bool {
        guard let url,
              let host = url.host,
              !host.isEmpty,
              !host.contains("YOUR_PROJECT") else {
            return false
        }
        if url.scheme == "https" { return true }
#if DEBUG
        return url.scheme == "http" && ["127.0.0.1", "localhost"].contains(host)
#else
        return false
#endif
    }

    private init() {
        let environment = ProcessInfo.processInfo.environment
        let urlString = environment["UNISHARE_SUPABASE_URL"]
            ?? Bundle.main.infoDictionary?["SUPABASE_URL"] as? String
            ?? ""
        let key = environment["UNISHARE_SUPABASE_KEY"]
            ?? (Bundle.main.infoDictionary?["SUPABASE_PUBLISHABLE_KEY"] as? String)
            ?? (Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String)
            ?? ""

        let configuredURL = URL(string: urlString)
        let hasValidURL = Self.isAllowedURL(configuredURL)
        let validURL = hasValidURL
            ? configuredURL!
            : URL(string: "https://placeholder.supabase.co")!

        let isLegacyAnonKey = key.components(separatedBy: ".").count == 3
        let isPublishableKey = key.hasPrefix("sb_publishable_")
        let validKey = isLegacyAnonKey || isPublishableKey ? key : Self.placeholderKey
        isConfigured = hasValidURL && (isLegacyAnonKey || isPublishableKey)

        if !isConfigured {
            print("SupabaseManager: credentials are not configured. Run 'make secrets', then 'make generate'.")
        }

        client = SupabaseClient(
            supabaseURL: validURL,
            supabaseKey: validKey,
            options: SupabaseClientOptions(
                auth: .init(
                    redirectToURL: URL(string: "unishare://auth-callback"),
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }
}
