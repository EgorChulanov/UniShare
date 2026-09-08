import Foundation

extension String {
    var localized: String {
        LocalizationManager.shared.localizedString(for: self)
    }

    func localized(with arguments: CVarArg...) -> String {
        String(format: localized, arguments: arguments)
    }
}
