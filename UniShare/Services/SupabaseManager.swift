import Foundation
import Supabase

final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private init() {
        let urlString = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String ?? ""
        let key = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String ?? ""

        guard
            !urlString.isEmpty,
            !urlString.hasPrefix("$("),
            let supabaseURL = URL(string: urlString),
            supabaseURL.scheme == "https" || supabaseURL.scheme == "http",
            supabaseURL.host != nil,
            !key.isEmpty,
            !key.hasPrefix("$(")
        else {
            fatalError(
                "Supabase configuration is missing or invalid.\n" +
                "SUPABASE_URL: '\(urlString)'\n" +
                "SUPABASE_ANON_KEY is \(key.isEmpty ? "empty" : "set")\n" +
                "Make sure Secrets.xcconfig is present and the Xcode project was regenerated with XcodeGen."
            )
        }

        client = SupabaseClient(supabaseURL: supabaseURL, supabaseKey: key)
    }
}
