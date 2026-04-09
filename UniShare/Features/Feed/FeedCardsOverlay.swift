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

    private var swipeThreshold: CGFloat = 100

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                // Card background
                if let url = card.avatarUrl {
                    AsyncImageView(url: url)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                } else {
                    theme.effectiveCardColor
                    Image(systemName: "person.fill")
                        .resizable()
                        .scaledToFit()
                        .padding(60)
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }

                // Gradient overlay
                LinearGradient(
                    colors: [Color.clear, Color.black.opacity(0.8)],
                    startPoint: .center,
                    endPoint: .bottom
                )

                // Swipe indicators
                if isTop {
                    if offset.width > 30 {
                        likeIndicator
                    }
                    if offset.width < -30 {
                        dislikeIndicator
                    }
                }

                // Card info
                cardInfo
                    .padding()
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .cornerRadius(24)
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.3), radius: 12, x: 0, y: 6)
            .scaleEffect(isTop ? 1.0 : 0.95)
            .offset(x: isTop ? offset.width : 0, y: isTop ? offset.height * 0.3 : 0)
            .rotationEffect(.degrees(isTop ? rotation : 0))
            .gesture(isTop ? dragGesture(size: geo.size) : nil)
            .animation(.spring(response: 0.5, dampingFraction: 0.8), value: isTop)
        }
        .frame(height: 520)
    }

    private func dragGesture(size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                offset = value.translation
                rotation = Double(value.translation.width / size.width) * 15
            }
            .onEnded { value in
                if value.translation.width > swipeThreshold {
                    flyOff(direction: .right)
                } else if value.translation.width < -swipeThreshold {
                    flyOff(direction: .left)
                } else {
                    withAnimation(.spring()) {
                        offset = .zero
                        rotation = 0
                    }
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

    private var cardInfo: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(card.username)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                if let platform = card.platform {
                    PlatformBadge(platform: platform, size: 30)
                }
            }

            if let status = card.status, !status.isEmpty {
                Text(status)
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.8))
                    .lineLimit(2)
            }

            if !card.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(card.tags.prefix(3)) { tag in
                            GameTagView(tag: tag)
                        }
                    }
                }
            }
        }
    }

    private var likeIndicator: some View {
        Text("LIKE")
            .font(.system(size: 24, weight: .heavy))
            .foregroundColor(.green)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.green, lineWidth: 3)
            )
            .rotationEffect(.degrees(-15))
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .opacity(Double(min(offset.width / swipeThreshold, 1.0)))
    }

    private var dislikeIndicator: some View {
        Text("NOPE")
            .font(.system(size: 24, weight: .heavy))
            .foregroundColor(.red)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.red, lineWidth: 3)
            )
            .rotationEffect(.degrees(15))
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .opacity(Double(min(-offset.width / swipeThreshold, 1.0)))
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
