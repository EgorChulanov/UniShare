import SwiftUI

struct AvatarView: View {
    let url: String?
    let size: CGFloat
    var showBorder: Bool = false

    @StateObject private var cache = AvatarCacheService.shared
    @State private var image: UIImage?
    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    theme.effectiveCardColor
                    Image(systemName: "person.fill")
                        .resizable()
                        .scaledToFit()
                        .padding(size * 0.2)
                        .foregroundColor(theme.effectiveTextColor.opacity(0.5))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(
            showBorder ?
            Circle().stroke(
                LinearGradient(
                    colors: [theme.effectivePrimary, theme.effectiveTertiary],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: 2
            ) : nil
        )
        .task(id: url) {
            guard let url, !url.isEmpty else { return }
            if let cached = AvatarCacheService.shared.image(for: url) {
                self.image = cached
            } else {
                self.image = await AvatarCacheService.shared.loadImage(from: url)
            }
        }
    }
}
