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
    @State private var showDetail = false

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
        .sheet(isPresented: $showDetail) {
            ProfileDetailSheet(card: card)
                .environmentObject(theme)
        }
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

                HStack(spacing: 5) {
                    ForEach(card.platforms, id: \.rawValue) { p in
                        PlatformBadge(platform: p, size: 16)
                    }
                }
            }

            Spacer()

            // Info button — tap to open full profile detail
            Button {
                showDetail = true
            } label: {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(theme.effectivePrimary.opacity(0.85))
            }
            .buttonStyle(.plain)
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
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        ForEach(Array(card.platforms.enumerated()), id: \.1.rawValue) { idx, platform in
                            let games = card.platformGames[platform.rawValue] ?? []
                            platformRow(platform: platform, games: games, isTrailing: idx % 2 == 0)
                            if idx < card.platforms.count - 1 {
                                Divider()
                                    .padding(.horizontal, 16)
                                    .background(theme.effectiveBackground.opacity(0.3))
                            }
                        }
                    }
                }
            }
        }
    }

    private func platformRow(platform: Platform, games: [String], isTrailing: Bool) -> some View {
        let tags = card.platformGameTags[platform.rawValue] ?? []
        let coverUrls = tags.reduce(into: [String: String]()) { dict, tag in
            if let url = tag.coverUrl { dict[tag.name] = url }
        }
        return VStack(alignment: isTrailing ? .trailing : .leading, spacing: 6) {
            Text(platform.rawValue)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(platform.color)
                .padding(.horizontal, 16)

            GameCirclesRow(games: games, color: platform.color, isTrailing: isTrailing, coverUrls: coverUrls)
        }
        .padding(.vertical, 10)
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

// MARK: - Profile Detail Sheet (from feed card)

struct ProfileDetailSheet: View {
    let card: ProfileCard

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Hero header
                        heroHeader

                        // Per-platform game rows
                        if !card.platforms.isEmpty {
                            VStack(spacing: 0) {
                                ForEach(Array(card.platforms.enumerated()), id: \.1.rawValue) { idx, platform in
                                    let games = card.platformGames[platform.rawValue] ?? []
                                    if !games.isEmpty {
                                        VStack(alignment: .leading, spacing: 8) {
                                            HStack(spacing: 8) {
                                                PlatformBadge(platform: platform, size: 18)
                                                Text(platform.rawValue)
                                                    .font(.system(size: 13, weight: .semibold))
                                                    .foregroundColor(platform.color)
                                            }
                                            .padding(.horizontal, 16)

                                            let tags = card.platformGameTags[platform.rawValue] ?? []
                                            let urls = tags.reduce(into: [String:String]()) { d,t in if let u = t.coverUrl { d[t.name]=u } }
                                            GameCirclesRow(games: games, color: platform.color, isTrailing: false, coverUrls: urls)
                                        }
                                        .padding(.vertical, 12)

                                        if idx < card.platforms.count - 1 {
                                            Divider().padding(.horizontal, 16)
                                        }
                                    }
                                }
                            }
                            .background(theme.effectiveCardColor)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .padding(.horizontal, 16)
                        }

                        // Skills
                        if !card.skills.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Skills")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(theme.effectiveSecondaryTextColor)
                                    .padding(.horizontal, 16)

                                FlowLayout(spacing: 8) {
                                    ForEach(card.skills, id: \.self) { skill in
                                        Text(skill)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundColor(theme.effectiveTextColor)
                                            .padding(.horizontal, 12).padding(.vertical, 7)
                                            .background(theme.effectiveTertiary.opacity(0.2))
                                            .cornerRadius(20)
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                            .padding(.vertical, 12)
                            .background(theme.effectiveCardColor)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle(card.username)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    }
                }
            }
        }
    }

    private var heroHeader: some View {
        ZStack(alignment: .bottomLeading) {
            // Background gradient
            LinearGradient(
                colors: [theme.effectiveTertiary.opacity(0.6), theme.effectiveCardColor],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 20))

            // Fade overlay
            LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: 20))

            VStack(alignment: .leading, spacing: 6) {
                AvatarView(url: card.avatarUrl, size: 64, showBorder: true)
                Text(card.username)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                if let status = card.status, !status.isEmpty {
                    Text(status)
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.8))
                }
                HStack(spacing: 4) {
                    HStack(spacing: 2) {
                        ForEach(1...5, id: \.self) { i in
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundColor(Double(i) <= card.rating ? .yellow : .white.opacity(0.3))
                        }
                    }
                    HStack(spacing: 6) {
                        ForEach(card.platforms, id: \.rawValue) { p in
                            PlatformBadge(platform: p, size: 18)
                        }
                    }
                }
            }
            .padding(16)
        }
        .frame(height: 220)
        .padding(.horizontal, 16)
    }
}
