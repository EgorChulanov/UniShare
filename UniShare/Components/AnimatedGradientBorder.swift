import SwiftUI

struct AnimatedGradientBorder: ViewModifier {
    var cornerRadius: CGFloat
    var lineWidth: CGFloat

    @State private var rotation: Double = 0
    @EnvironmentObject var theme: ThemeManager

    func body(content: Content) -> some View {
        content
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(
                        AngularGradient(
                            gradient: Gradient(colors: [
                                theme.effectivePrimary,
                                theme.effectiveTertiary,
                                theme.effectivePrimary.opacity(0.5),
                                theme.effectiveTertiary.opacity(0.7),
                                theme.effectivePrimary
                            ]),
                            center: .center,
                            angle: .degrees(rotation)
                        ),
                        lineWidth: lineWidth
                    )
            )
            .onAppear {
                withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            }
    }
}

extension View {
    func animatedGradientBorder(cornerRadius: CGFloat = 16, lineWidth: CGFloat = 2) -> some View {
        modifier(AnimatedGradientBorder(cornerRadius: cornerRadius, lineWidth: lineWidth))
    }
}

// MARK: - AnimatedFullScreenGlow

struct AnimatedFullScreenGlow: View {
    var isExpanded: Bool
    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        GeometryReader { geo in
            let size = max(geo.size.width, geo.size.height)
            let targetSize = isExpanded ? size * 3 : 120.0

            AngularGradient(
                gradient: Gradient(colors: [
                    theme.effectivePrimary.opacity(0.6),
                    theme.effectiveTertiary.opacity(0.4),
                    theme.effectivePrimary.opacity(0.3),
                    theme.effectiveTertiary.opacity(0.6),
                    theme.effectivePrimary.opacity(0.6)
                ]),
                center: .center
            )
            .frame(width: targetSize, height: targetSize)
            .clipShape(Circle())
            .blur(radius: isExpanded ? 40 : 20)
            .opacity(isExpanded ? 0.8 : 0.4)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
            .animation(.easeInOut(duration: 1.2), value: isExpanded)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}
