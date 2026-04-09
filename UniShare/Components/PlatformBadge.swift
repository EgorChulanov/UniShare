import SwiftUI

struct PlatformBadge: View {
    let platform: Platform
    var size: CGFloat = 32

    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        ZStack {
            Circle()
                .fill(platform.color.opacity(0.15))
                .frame(width: size, height: size)
            Image(systemName: platform.icon)
                .resizable()
                .scaledToFit()
                .frame(width: size * 0.5, height: size * 0.5)
                .foregroundColor(platform.color)
        }
    }
}

struct PlatformBadgeRow: View {
    let platforms: [Platform]
    var size: CGFloat = 28

    var body: some View {
        HStack(spacing: 8) {
            ForEach(platforms, id: \.rawValue) { platform in
                PlatformBadge(platform: platform, size: size)
            }
        }
    }
}
