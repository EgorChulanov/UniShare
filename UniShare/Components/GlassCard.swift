import SwiftUI

// MARK: - Glass ViewModifier

struct GlassModifier: ViewModifier {
    var cornerRadius: CGFloat
    var opacity: Double

    @EnvironmentObject var theme: ThemeManager

    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    theme.effectiveCardColor.opacity(opacity)
                    Color.white.opacity(0.05)
                }
            )
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
    }
}

extension View {
    func glass(cornerRadius: CGFloat = 16, opacity: Double = 0.7) -> some View {
        modifier(GlassModifier(cornerRadius: cornerRadius, opacity: opacity))
    }
}

// MARK: - GlassCard Container

struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat
    var padding: CGFloat
    let content: Content

    @EnvironmentObject var theme: ThemeManager

    init(cornerRadius: CGFloat = 16, padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.cornerRadius = cornerRadius
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .glass(cornerRadius: cornerRadius)
    }
}
