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
            BrandIcon(assetName: platform.brandAssetName, systemName: platform.icon)
                .frame(width: size * 0.52, height: size * 0.52)
                .foregroundStyle(platform.color)
        }
    }
}

struct BrandIcon: View {
    let assetName: String?
    let systemName: String

    var body: some View {
        if let assetName, UIImage(named: assetName) != nil {
            Image(assetName)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .accessibilityHidden(true)
        } else {
            Image(systemName: systemName)
                .resizable()
                .scaledToFit()
                .accessibilityHidden(true)
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
