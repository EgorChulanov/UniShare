import SwiftUI
import Combine

// Reusable auto-scrolling game circles row used in feed cards and profile view.

struct GameCirclesRow: View {
    let games: [String]
    let color: Color
    let isTrailing: Bool
    var coverUrls: [String: String] = [:]   // game name → RAWG cover URL

    @EnvironmentObject var theme: ThemeManager
    @State private var scrollIndex = 0

    private let scrollTimer = Timer.publish(every: 2.5, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 0) {
            if isTrailing { Spacer(minLength: 0) }

            if games.isEmpty {
                Text("—")
                    .font(.system(size: 12))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .padding(.horizontal, 16)
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(Array(games.enumerated()), id: \.0) { idx, name in
                                GameCircleView(name: name, color: color, coverUrl: coverUrls[name])
                                    .id(idx)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .onReceive(scrollTimer) { _ in
                        guard games.count > 3 else { return }
                        withAnimation(.easeInOut(duration: 0.6)) {
                            scrollIndex = (scrollIndex + 1) % games.count
                            proxy.scrollTo(scrollIndex,
                                           anchor: isTrailing ? .trailing : .leading)
                        }
                    }
                }
            }

            if !isTrailing { Spacer(minLength: 0) }
        }
    }
}

// MARK: - Single game circle

struct GameCircleView: View {
    let name: String
    let color: Color

    @EnvironmentObject var theme: ThemeManager

    // If a cover URL is provided (e.g. from RAWG) it renders as image; otherwise letter
    var coverUrl: String? = nil
    @State private var coverImage: UIImage?

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.18))
                    .overlay(Circle().stroke(color.opacity(0.45), lineWidth: 1))

                if let img = coverImage {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .clipShape(Circle())
                } else {
                    Text(String(name.prefix(2)).uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(color)
                }
            }
            .frame(width: 44, height: 44)

            Text(name.components(separatedBy: " ").first ?? name)
                .font(.system(size: 8))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .lineLimit(1)
                .frame(width: 44)
        }
        .task(id: coverUrl) {
            guard let url = coverUrl else { return }
            coverImage = await GameIconCacheService.shared.loadImage(from: url)
        }
    }
}
