import SwiftUI

struct BrandBackground: View {
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        ZStack {
            theme.effectiveBackground

            Circle()
                .fill(theme.effectivePrimary.opacity(0.10))
                .frame(width: 340, height: 340)
                .blur(radius: 80)
                .offset(x: 150, y: -280)

            Circle()
                .fill(theme.effectiveTertiary.opacity(0.06))
                .frame(width: 280, height: 280)
                .blur(radius: 90)
                .offset(x: -170, y: 310)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
