import SwiftUI

struct FeedCardsOverlay: View {
    let cards: [ProfileCard]
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        ZStack {
            if cards.isEmpty {
                emptyState
            } else {
                ForEach(cards.prefix(3).reversed()) { card in
                    SwipeCard(
                        card: card,
                        isTop: card.id == cards.first?.id,
                        onSwipeRight: onSwipeRight,
                        onSwipeLeft: onSwipeLeft
                    )
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "star.slash.fill")
                .font(.system(size: 48))
                .foregroundColor(theme.effectiveSecondaryTextColor)
            Text("feed.empty".localized)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(theme.effectiveTextColor)
            Text("feed.empty.subtitle".localized)
                .font(.system(size: 14))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - SwipeCard

struct SwipeCard: View {
    let card: ProfileCard
    let isTop: Bool
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @State private var offset: CGSize = .zero
    @State private var rotation: Double = 0

    @EnvironmentObject var theme: ThemeManager

    private static let swipeThreshold: CGFloat = 100

    var body: some View {
        GeometryReader { geo in
            ZStack {
                VStack(spacing: 0) {
                    topInfoSection
                    Divider().background(theme.effectiveBackground.opacity(0.4))
                    platformsSection
                }
                .background(theme.effectiveCardColor)
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.white.opacity(0.08), lineWidth: 1))
                .shadow(color: .black.opacity(0.28), radius: 12, x: 0, y: 6)
                .scaleEffect(isTop ? 1.0 : 0.95)
                .offset(x: isTop ? offset.width : 0, y: isTop ? offset.height * 0.3 : 0)
                .rotationEffect(.degrees(isTop ? rotation : 0))
                .gesture(isTop ? dragGesture(size: geo.size) : nil)
                .animation(.spring(response: 0.5, dampingFraction: 0.8), value: isTop)

                if isTop {
                    if offset.width > 30 { likeIndicator }
                    if offset.width < -30 { dislikeIndicator }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(height: 460)
    }

    // MARK: - Top Info

    private var topInfoSection: some View {
        HStack(alignment: .top, spacing: 14) {
            AvatarView(url: card.avatarUrl, size: 64, showBorder: true)

            VStack(alignment: .leading, spacing: 5) {
                Text(card.username)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(theme.effectiveTextColor)
                    .lineLimit(1)

                if let status = card.status, !status.isEmpty {
                    Text(status)
                        .font(.system(size: 13))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                        .lineLimit(1)
                }

                // Rating
                HStack(spacing: 3) {
                    ForEach(1...5, id: \.self) { i in
                        Image(systemName: "star.fill")
                            .font(.system(size: 9))
                            .foregroundColor(Double(i) <= card.rating ? .yellow : theme.effectiveSecondaryTextColor.opacity(0.3))
                    }
                    if card.rating > 0 {
                        Text(String(format: "%.1f", card.rating))
                            .font(.system(size: 10))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    }
                }

                // Platform badges
                HStack(spacing: 5) {
                    ForEach(card.platforms, id: \.rawValue) { p in
                        PlatformBadge(platform: p, size: 16)
                    }
                }
            }
            Spacer()
        }
        .padding(16)
    }

    // MARK: - Platforms / Games

    private var platformsSection: some View {
        Group {
            if card.platforms.isEmpty {
                Spacer()
                Text("No platforms added")
                    .font(.system(size: 13))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                Spacer()
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(card.platforms.enumerated()), id: \.1.rawValue) { idx, platform in
                        let games = card.platformGames[platform.rawValue] ?? []
                        platformRow(platform: platform, games: games, isTrailing: idx % 2 == 0)
                        if idx < card.platforms.count - 1 {
                            Divider().padding(.horizontal, 16).background(theme.effectiveBackground.opacity(0.3))
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private func platformRow(platform: Platform, games: [String], isTrailing: Bool) -> some View {
        VStack(alignment: isTrailing ? .trailing : .leading, spacing: 8) {
            Text(platform.rawValue)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(platform.color)
                .padding(.horizontal, 16)

            HStack(spacing: 0) {
                if isTrailing { Spacer(minLength: 0) }
                HStack(spacing: 10) {
                    if games.isEmpty {
                        Text("—")
                            .font(.system(size: 12))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    } else {
                        ForEach(games.prefix(5), id: \.self) { name in
                            gameCircle(name: name, color: platform.color)
                        }
                    }
                }
                .padding(.horizontal, 16)
                if !isTrailing { Spacer(minLength: 0) }
            }
        }
        .padding(.vertical, 12)
    }

    private func gameCircle(name: String, color: Color) -> some View {
        VStack(spacing: 3) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.18))
                    .overlay(Circle().stroke(color.opacity(0.45), lineWidth: 1))
                Text(String(name.prefix(2)).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(color)
            }
            .frame(width: 44, height: 44)

            Text(name.components(separatedBy: " ").first ?? name)
                .font(.system(size: 8))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .lineLimit(1)
                .frame(width: 44)
        }
    }

    // MARK: - Gesture

    private func dragGesture(size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                offset = value.translation
                rotation = Double(value.translation.width / size.width) * 15
            }
            .onEnded { value in
                if value.translation.width > SwipeCard.swipeThreshold {
                    flyOff(direction: .right)
                } else if value.translation.width < -SwipeCard.swipeThreshold {
                    flyOff(direction: .left)
                } else {
                    withAnimation(.spring()) { offset = .zero; rotation = 0 }
                }
            }
    }

    private func flyOff(direction: SwipeDirection) {
        let targetX: CGFloat = direction == .right ? 600 : -600
        withAnimation(.easeIn(duration: 0.25)) {
            offset = CGSize(width: targetX, height: offset.height)
            rotation = direction == .right ? 20 : -20
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if direction == .right {
                HapticsManager.shared.playSwipeRight()
                onSwipeRight(card)
            } else {
                onSwipeLeft(card)
            }
        }
    }

    // MARK: - Indicators

    private var likeIndicator: some View {
        Text("LIKE")
            .font(.system(size: 24, weight: .heavy))
            .foregroundColor(.green)
            .padding(.horizontal, 16).padding(.vertical, 8)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.green, lineWidth: 3))
            .rotationEffect(.degrees(-15))
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .opacity(Double(min(offset.width / SwipeCard.swipeThreshold, 1.0)))
    }

    private var dislikeIndicator: some View {
        Text("NOPE")
            .font(.system(size: 24, weight: .heavy))
            .foregroundColor(.red)
            .padding(.horizontal, 16).padding(.vertical, 8)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.red, lineWidth: 3))
            .rotationEffect(.degrees(15))
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .opacity(Double(min(-offset.width / SwipeCard.swipeThreshold, 1.0)))
    }
}

enum SwipeDirection { case left, right }

// MARK: - Async Image

struct AsyncImageView: View {
    let url: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.gray.opacity(0.2)
                    .overlay(ProgressView())
            }
        }
        .task(id: url) {
            image = await AvatarCacheService.shared.loadImage(from: url)
        }
    }
}
