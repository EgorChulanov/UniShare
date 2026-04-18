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

    // Adaptive text color based on background luminance
    var textColor: Color {
        background.isLight ? Color.black : Color.white
    }

    var secondaryTextColor: Color {
        textColor.opacity(0.6)
    }

    // MARK: Presets

    static let liquidNebula = CardColorTheme(
        id: "liquid_nebula",
        name: "Liquid Nebula",
        primary: Color(hex: "#E94560"),
        background: Color(hex: "#1A1A2E"),
        tertiary: Color(hex: "#4A148C"),
        neutral: Color(hex: "#0F3460"),
        cardSurface: Color(hex: "#16213E")
    )

    static let peachFuzz2024 = CardColorTheme(
        id: "peach_fuzz_2024",
        name: "Peach Fuzz 2024",
        primary: Color(hex: "#FFBE98"),
        background: Color(hex: "#1C1010"),
        tertiary: Color(hex: "#D4845A"),
        neutral: Color(hex: "#2C1A15"),
        cardSurface: Color(hex: "#221512")
    )

    static let vivaMagenta2023 = CardColorTheme(
        id: "viva_magenta_2023",
        name: "Viva Magenta 2023",
        primary: Color(hex: "#BB2649"),
        background: Color(hex: "#1A0D10"),
        tertiary: Color(hex: "#8B1A2F"),
        neutral: Color(hex: "#2D0E18"),
        cardSurface: Color(hex: "#220B13")
    )

    static let veryPeri2022 = CardColorTheme(
        id: "very_peri_2022",
        name: "Very Peri 2022",
        primary: Color(hex: "#6667AB"),
        background: Color(hex: "#0D0D1A"),
        tertiary: Color(hex: "#4445A8"),
        neutral: Color(hex: "#121230"),
        cardSurface: Color(hex: "#0F0F22")
    )

    static let ultimateGray2021 = CardColorTheme(
        id: "ultimate_gray_2021",
        name: "Ultimate Gray 2021",
        primary: Color(hex: "#939597"),
        background: Color(hex: "#111111"),
        tertiary: Color(hex: "#F5DF4D"),
        neutral: Color(hex: "#1E1E1E"),
        cardSurface: Color(hex: "#181818")
    )

    // Pantone 2025: Mocha Mousse — warm dark cocoa surfaces
    static let mochaMousse2025 = CardColorTheme(
        id: "mocha_mousse_2025",
        name: "Mocha Mousse 2025",
        primary: Color(hex: "#A47864"),
        background: Color(hex: "#120D0A"),
        tertiary: Color(hex: "#6667AB"),   // Very Peri as secondary accent
        neutral: Color(hex: "#1F1612"),
        cardSurface: Color(hex: "#1F1612")
    )

    static let all: [CardColorTheme] = [
        .mochaMousse2025,
        .liquidNebula,
        .peachFuzz2024,
        .vivaMagenta2023,
        .veryPeri2022,
        .ultimateGray2021
    ]
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
