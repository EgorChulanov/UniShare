import SwiftUI
import Combine

final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @AppStorage("app_theme") private var storedTheme: String = AppTheme.system.rawValue
    @AppStorage("card_color_theme") private var storedCardColorId: String = "signal_blue"

    @Published var currentTheme: AppTheme = .system
    @Published var currentCardColor: CardColorTheme = .signalBlue

    private init() {
        currentTheme = AppTheme(rawValue: storedTheme) ?? .system
        currentCardColor = CardColorTheme.all.first { $0.id == storedCardColorId } ?? .signalBlue
    }

    // MARK: - Computed Appearance

    var effectiveColorScheme: ColorScheme? {
        currentTheme.colorScheme
    }

    var effectiveBackground: Color {
        currentCardColor.background
    }

    var effectiveTextColor: Color {
        currentCardColor.textColor
    }

    var effectiveSecondaryTextColor: Color {
        currentCardColor.secondaryTextColor
    }

    var effectiveCardColor: Color {
        currentCardColor.cardSurface
    }

    var effectivePrimary: Color {
        currentCardColor.primary
    }

    var effectiveTertiary: Color {
        currentCardColor.tertiary
    }

    // MARK: - Mutation

    func setTheme(_ theme: AppTheme) {
        currentTheme = theme
        storedTheme = theme.rawValue
    }

    func setCardColor(_ theme: CardColorTheme) {
        currentCardColor = theme
        storedCardColorId = theme.id
    }

    // MARK: - Tab Bar UIKit sync

    func applyTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.backgroundColor = UIColor(currentCardColor.neutral).withAlphaComponent(0.92)

        let itemAppearance = UITabBarItemAppearance()
        itemAppearance.normal.iconColor = UIColor(currentCardColor.textColor.opacity(0.5))
        itemAppearance.selected.iconColor = UIColor(currentCardColor.primary)
        itemAppearance.normal.titleTextAttributes = [.foregroundColor: UIColor(currentCardColor.textColor.opacity(0.5))]
        itemAppearance.selected.titleTextAttributes = [.foregroundColor: UIColor(currentCardColor.primary)]

        appearance.stackedLayoutAppearance = itemAppearance
        appearance.inlineLayoutAppearance = itemAppearance
        appearance.compactInlineLayoutAppearance = itemAppearance

        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}
