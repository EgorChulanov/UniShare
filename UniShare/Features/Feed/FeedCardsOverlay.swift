import SwiftUI

struct FeedCardsOverlay: View {
    let cards: [ProfileCard]
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        ZStack {
            if cards.isEmpty {
                emptyState
            } else {
                ForEach(Array(Array(cards.prefix(3).enumerated()).reversed()), id: \.element.id) { item in
                    SwipeCard(
                        card: item.element,
                        isTop: item.offset == 0,
                        stackDepth: item.offset,
                        onSwipeRight: onSwipeRight,
                        onSwipeLeft: onSwipeLeft
                    )
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "rectangle.stack.badge.person.crop")
                .font(.system(size: 42, weight: .medium))
            Text("feed.empty".localized)
                .font(.system(size: 19, weight: .bold))
            Text("feed.empty.subtitle".localized)
                .font(.system(size: 14, weight: .medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(theme.effectiveSecondaryTextColor)
        }
        .foregroundStyle(theme.effectiveTextColor)
        .padding(28)
    }
}

struct SwipeCard: View {
    let card: ProfileCard
    let isTop: Bool
    let stackDepth: Int
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @State private var offset: CGSize = .zero
    @State private var rotation = 0.0
    @State private var showDetail = false

    private static let swipeThreshold: CGFloat = 105

    private var featuredPlatform: Platform? {
        card.platform ?? card.platforms.first
    }

    private var playingTags: [GameTag] {
        guard let platform = featuredPlatform else { return card.tags }
        return card.platformGameTags[platform.rawValue].flatMap { $0.isEmpty ? nil : $0 } ?? card.tags
    }

    var body: some View {
        GeometryReader { geometry in
            cardSurface
                .frame(width: geometry.size.width, height: geometry.size.height)
                .scaleEffect(isTop ? 1 : 1 - CGFloat(stackDepth) * 0.035)
                .offset(
                    x: isTop ? offset.width : 0,
                    y: isTop ? offset.height * 0.24 : CGFloat(stackDepth) * 10
                )
                .rotationEffect(.degrees(isTop ? rotation : Double(stackDepth % 2 == 0 ? -1 : 1)))
                .gesture(isTop ? dragGesture(width: geometry.size.width) : nil)
                .onTapGesture {
                    guard isTop, abs(offset.width) < 8, abs(offset.height) < 8 else { return }
                    showDetail = true
                }
                .animation(.spring(response: 0.42, dampingFraction: 0.82), value: offset)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("feed.card.\(card.userId)")
        .sheet(isPresented: $showDetail) {
            ProfileDetailSheet(card: card)
        }
    }

    private var cardSurface: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#4A4A4A"), Color(hex: "#343434"), Color(hex: "#292929")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(.white.opacity(0.04))
                .frame(width: 280, height: 280)
                .blur(radius: 2)
                .offset(x: 145, y: -220)

            VStack(alignment: .leading, spacing: 0) {
                profileHeader

                Spacer(minLength: 18)

                if let platform = featuredPlatform {
                    platformPill(platform)
                        .padding(.bottom, 20)
                }

                gameSection(title: "profile.games".localized, tags: playingTags)

                if !card.wantedTags.isEmpty {
                    gameSection(title: "profile.wanted".localized, tags: card.wantedTags)
                        .padding(.top, 22)
                }

                Spacer(minLength: 12)

                HStack {
                    Text("feed.card.tap_details".localized)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.48))
                    Spacer()
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white.opacity(0.48))
                }
            }
            .padding(22)

            if isTop, offset.width > 24 {
                swipeIndicator(symbol: "heart.fill", color: Color(hex: "#32D875"), progress: offset.width)
            }
            if isTop, offset.width < -24 {
                swipeIndicator(symbol: "xmark", color: Color(hex: "#FF453A"), progress: -offset.width)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.28), radius: 24, y: 14)
    }

    private var profileHeader: some View {
        HStack(spacing: 13) {
            AvatarView(url: card.avatarUrl, size: 54, showBorder: false)
                .overlay(Circle().stroke(.white.opacity(0.22), lineWidth: 1))

            VStack(alignment: .leading, spacing: 3) {
                Text(card.username)
                    .font(.system(size: 21, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let status = card.status, !status.isEmpty {
                    Text(status)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(1)
                }
            }

            Spacer()

            if card.rating > 0 {
                Label(String(format: "%.1f", card.rating), systemImage: "star.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.18), in: Capsule())
            }
        }
    }

    private func platformPill(_ platform: Platform) -> some View {
        HStack(spacing: 7) {
            BrandIcon(assetName: platform.brandAssetName, systemName: platform.icon)
                .frame(width: 15, height: 15)
            Text(platform.rawValue)
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(.black.opacity(0.16), in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.35), lineWidth: 1))
    }

    private func gameSection(title: String, tags: [GameTag]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)

            if tags.isEmpty {
                Text("profile.games.add.hint".localized)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.45))
            } else {
                GameCirclesRow(
                    games: tags.map(\.name),
                    color: .white,
                    isTrailing: false,
                    coverUrls: Dictionary(uniqueKeysWithValues: tags.compactMap { tag in
                        tag.coverUrl.map { (tag.name, $0) }
                    }),
                    diameter: 58,
                    showsTitles: false
                )
                .environmentObject(ThemeManager.shared)
                .padding(.horizontal, -16)
            }
        }
    }

    private func swipeIndicator(symbol: String, color: Color, progress: CGFloat) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 82, weight: .heavy))
            .foregroundStyle(color)
            .shadow(color: .black.opacity(0.22), radius: 8, y: 4)
            .opacity(Double(min(progress / Self.swipeThreshold, 1)))
    }

    private func dragGesture(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                offset = value.translation
                rotation = Double(value.translation.width / max(width, 1)) * 12
            }
            .onEnded { value in
                if value.translation.width > Self.swipeThreshold {
                    flyOff(.right)
                } else if value.translation.width < -Self.swipeThreshold {
                    flyOff(.left)
                } else {
                    offset = .zero
                    rotation = 0
                }
            }
    }

    private func flyOff(_ direction: SwipeDirection) {
        let x: CGFloat = direction == .right ? 720 : -720
        withAnimation(.easeIn(duration: 0.24)) {
            offset = CGSize(width: x, height: offset.height)
            rotation = direction == .right ? 18 : -18
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
            if direction == .right {
                HapticsManager.shared.playSwipeRight()
                onSwipeRight(card)
            } else {
                HapticsManager.shared.playSwipeLeft()
                onSwipeLeft(card)
            }
        }
    }
}

enum SwipeDirection { case left, right }

struct AsyncImageView: View {
    let url: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Color.white.opacity(0.08).overlay(ProgressView().tint(.white))
            }
        }
        .task(id: url) {
            image = await AvatarCacheService.shared.loadImage(from: url)
        }
    }
}

struct ProfileDetailSheet: View {
    let card: ProfileCard

    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        NavigationStack {
            ZStack {
                BrandBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header

                        ForEach(card.platforms, id: \.rawValue) { platform in
                            let tags = filtered(card.platformGameTags[platform.rawValue] ?? [])
                            if !tags.isEmpty {
                                gameList(title: platform.rawValue, platform: platform, tags: tags)
                            }
                        }

                        let wanted = filtered(card.wantedTags)
                        if !wanted.isEmpty {
                            gameList(title: "profile.wanted".localized, platform: nil, tags: wanted)
                        }

                        if !card.skills.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("profile.skills".localized)
                                    .font(.system(size: 18, weight: .bold))
                                FlowLayout(spacing: 8) {
                                    ForEach(card.skills, id: \.self) { skill in
                                        Text(skill)
                                            .font(.system(size: 13, weight: .semibold))
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 8)
                                            .background(theme.effectiveCardColor, in: Capsule())
                                    }
                                }
                            }
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle(card.username)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "feed.search.placeholder".localized)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 16) {
            AvatarView(url: card.avatarUrl, size: 76, showBorder: true)
            VStack(alignment: .leading, spacing: 6) {
                Text(card.username)
                    .font(.system(size: 24, weight: .bold))
                if let status = card.status, !status.isEmpty {
                    Text(status)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(theme.effectiveSecondaryTextColor)
                }
                PlatformBadgeRow(platforms: card.platforms, size: 28)
            }
        }
    }

    private func gameList(title: String, platform: Platform?, tags: [GameTag]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                if let platform {
                    BrandIcon(assetName: platform.brandAssetName, systemName: platform.icon)
                        .frame(width: 18, height: 18)
                        .foregroundStyle(platform.color)
                }
                Text(title)
                    .font(.system(size: 18, weight: .bold))
            }

            ForEach(tags) { tag in
                HStack(spacing: 13) {
                    GameCircleView(
                        name: tag.name,
                        color: platform?.color ?? theme.effectivePrimary,
                        coverUrl: tag.coverUrl,
                        diameter: 58,
                        showsTitle: false
                    )
                    Text(tag.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(theme.effectiveTextColor)
                    Spacer()
                }
                .padding(10)
                .background(theme.effectiveCardColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
    }

    private func filtered(_ tags: [GameTag]) -> [GameTag] {
        guard !query.isEmpty else { return tags }
        return tags.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }
}
