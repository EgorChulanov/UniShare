import SwiftUI
import Combine

final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @AppStorage("app_theme") private var storedTheme: String = AppTheme.dark.rawValue
    @AppStorage("card_color_theme") private var storedCardColorId: String = "liquid_nebula"

    @Published var currentTheme: AppTheme = .dark
    @Published var currentCardColor: CardColorTheme = .liquidNebula

    private init() {
        currentTheme = AppTheme(rawValue: storedTheme) ?? .dark
        currentCardColor = CardColorTheme.all.first { $0.id == storedCardColorId } ?? .liquidNebula
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
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(currentCardColor.neutral)

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
