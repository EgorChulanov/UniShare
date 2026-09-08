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
                    theme.effectiveCardColor.opacity(max(opacity, 0.86))
                    theme.effectiveTextColor.opacity(0.025)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(theme.effectiveTextColor.opacity(0.14), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 8, y: 3)
    }
}

extension View {
    func glass(cornerRadius: CGFloat = 16, opacity: Double = 0.7) -> some View {
        modifier(GlassModifier(cornerRadius: cornerRadius, opacity: opacity))
    }

    @ViewBuilder
    func adaptiveGlass<S: Shape>(in shape: S, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            if interactive {
                glassEffect(.regular.interactive(), in: shape)
            } else {
                glassEffect(.regular, in: shape)
            }
        } else {
            background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(Color.primary.opacity(0.1), lineWidth: 0.75))
                .shadow(color: Color.black.opacity(0.08), radius: 12, y: 5)
        }
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
