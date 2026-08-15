import SwiftUI

// MARK: - CardColorTheme

struct CardColorTheme: Identifiable, Equatable {
    var id: String
    var name: String
    var primary: Color      // accent, buttons
    var background: Color   // app background
    var tertiary: Color     // secondary accent
    var neutral: Color      // neutral dark
    var cardSurface: Color  // card background

    var textColor: Color {
        Color(uiColor: .label)
    }

    var secondaryTextColor: Color {
        Color(uiColor: .secondaryLabel)
    }

    // MARK: Presets

    static let signalBlue = CardColorTheme(
        id: "signal_blue",
        name: "Signal Blue",
        primary: Color(hex: "#0057FF"),
        background: Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 14 / 255, green: 17 / 255, blue: 23 / 255, alpha: 1)
                : UIColor(red: 248 / 255, green: 247 / 255, blue: 244 / 255, alpha: 1)
        }),
        tertiary: Color(hex: "#4D8BFF"),
        neutral: Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 23 / 255, green: 27 / 255, blue: 36 / 255, alpha: 1)
                : .white
        }),
        cardSurface: Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 23 / 255, green: 27 / 255, blue: 36 / 255, alpha: 1)
                : .white
        })
    )

    static let all: [CardColorTheme] = [.signalBlue]
}

// MARK: - AppTheme

enum AppTheme: String, CaseIterable {
    case system = "system"
    case light = "light"
    case dark = "dark"

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    var displayName: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }
}

// MARK: - Color luminance helper

extension Color {
    var isLight: Bool {
        guard let components = UIColor(self).cgColor.components, components.count >= 3 else {
            return false
        }
        let brightness = (components[0] * 299 + components[1] * 587 + components[2] * 114) / 1000
        return brightness > 0.5
    }
}
