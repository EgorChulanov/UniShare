import SwiftUI

struct BrandBackground: View {
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                theme.effectiveBackground

                Ellipse()
                    .fill(theme.effectivePrimary.opacity(0.14))
                    .frame(width: min(geometry.size.width * 1.1, 390), height: 280)
                    .blur(radius: 92)
                    .offset(x: geometry.size.width * 0.34, y: -geometry.size.height * 0.35)

                Circle()
                    .fill(theme.effectiveTertiary.opacity(0.10))
                    .frame(width: min(geometry.size.width * 0.8, 280))
                    .blur(radius: 90)
                    .offset(x: -geometry.size.width * 0.4, y: geometry.size.height * 0.34)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
