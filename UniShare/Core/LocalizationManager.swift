import Foundation
import Combine

final class LocalizationManager: ObservableObject {
    static let shared = LocalizationManager()

    @Published var currentLanguage: String

    private var bundle: Bundle = .main

    private init() {
        let saved = UserDefaults.standard.string(forKey: "app_language")
        let preferred = Locale.preferredLanguages.first?.prefix(2).lowercased() ?? "en"
        let supported = ["ru", "en", "uk", "be"]
        let lang = supported.contains(saved ?? "") ? (saved ?? String(preferred)) : (supported.contains(String(preferred)) ? String(preferred) : "en")
        currentLanguage = lang
        setBundle(for: lang)
    }

    func setLanguage(_ code: String) {
        guard currentLanguage != code else { return }
        currentLanguage = code
        UserDefaults.standard.set(code, forKey: "app_language")
        setBundle(for: code)
        objectWillChange.send()
    }

    func localizedString(for key: String) -> String {
        bundle.localizedString(forKey: key, value: key, table: "Localizable")
    }

    private func setBundle(for language: String) {
        guard
            let path = Bundle.main.path(forResource: language, ofType: "lproj"),
            let langBundle = Bundle(path: path)
        else {
            bundle = .main
            return
        }
        bundle = langBundle
    }
}
