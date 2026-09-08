import SwiftUI
import Combine
import CoreMotion

struct FeedCardsOverlay: View {
    let cards: [ProfileCard]
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void
    var onOpenDetail: ((ProfileCard) -> Void)? = nil

    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        ZStack {
            if cards.isEmpty {
                emptyState
            } else {
                ForEach(Array(cards.prefix(3).enumerated()).reversed(), id: \.element.id) { depth, card in
                    SwipeCard(
                        card: card,
                        depth: depth,
                        onSwipeRight: onSwipeRight,
                        onSwipeLeft: onSwipeLeft,
                        onOpenDetail: onOpenDetail
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

@MainActor
final class CardMotionController: ObservableObject {
    @Published private(set) var tilt = CGSize.zero
    private let manager = CMMotionManager()
    private var baseline: (roll: Double, pitch: Double)?

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 30.0
        manager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] motion, _ in
            guard let self, let attitude = motion?.attitude else { return }
            if self.baseline == nil {
                self.baseline = (attitude.roll, attitude.pitch)
                return
            }
            guard let baseline = self.baseline else { return }
            let x = max(-5.0, min(5.0, (attitude.roll - baseline.roll) * 18.0))
            let y = max(-5.0, min(5.0, -(attitude.pitch - baseline.pitch) * 18.0))
            self.tilt = CGSize(
                width: self.tilt.width * 0.84 + x * 0.16,
                height: self.tilt.height * 0.84 + y * 0.16
            )
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        baseline = nil
        withAnimation(.easeOut(duration: 0.3)) { tilt = .zero }
    }
}

extension ProfileCardDesign {
    func foregroundColor(for scheme: ColorScheme?) -> Color {
        self == .classic && scheme != .dark ? Color(hex: "#172033") : .white
    }
}

struct CardDesignBackground: View {
    let design: ProfileCardDesign
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            if design == .classic {
                LinearGradient(
                    colors: colorScheme == .dark
                        ? [Color(hex: "#24272D"), Color(hex: "#111318")]
                        : [Color(hex: "#FFFDF8"), Color(hex: "#EEEAE1")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            } else {
                Image(design.assetName)
                    .resizable()
                    .scaledToFill()
            }

            if design != .classic {
                LinearGradient(
                    colors: [.black.opacity(0.03), .clear, .black.opacity(0.12)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        }
        .clipped()
    }
}

struct CardGlossOverlay: View {
    let tilt: CGSize

    var body: some View {
        GeometryReader { geo in
            let center = UnitPoint(
                x: min(max(0.08, 0.28 + tilt.width / 11), 0.88),
                y: min(max(0.08, 0.2 + tilt.height / 11), 0.84)
            )
            let diameter = max(geo.size.width, geo.size.height)

            ZStack {
                RadialGradient(
                    colors: [
                        .white.opacity(0.2),
                        Color(hex: "#BCEFFF").opacity(0.09),
                        Color(hex: "#FFD8A8").opacity(0.04),
                        .clear
                    ],
                    center: center,
                    startRadius: 0,
                    endRadius: diameter * 0.43
                )

                AngularGradient(
                    colors: [
                        .clear,
                        Color(hex: "#68E4FF").opacity(0.09),
                        Color(hex: "#FFE8A3").opacity(0.07),
                        Color(hex: "#FF8FB8").opacity(0.07),
                        .clear
                    ],
                    center: center,
                    angle: .degrees(Double(tilt.width - tilt.height) * 4)
                )
                .blur(radius: 10)
                .mask {
                    RadialGradient(
                        colors: [.white, .white.opacity(0.7), .clear],
                        center: center,
                        startRadius: 0,
                        endRadius: diameter * 0.48
                    )
                }

                Ellipse()
                    .fill(
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.12), .clear],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: geo.size.width * 0.92, height: geo.size.height * 0.28)
                    .rotationEffect(.degrees(-28 + Double(tilt.width) * 1.8))
                    .position(
                        x: center.x * geo.size.width,
                        y: center.y * geo.size.height
                    )
                    .blur(radius: 9)
            }
            .compositingGroup()
            .blendMode(.screen)
        }
    }
}

// MARK: - SwipeCard

struct SwipeCard: View {
    let card: ProfileCard
    let depth: Int
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void
    var onOpenDetail: ((ProfileCard) -> Void)? = nil

    @State private var offset: CGSize = .zero
    @State private var rotation: Double = 0
    @State private var showDetail = false
    @State private var isCompletingSwipe = false
    @StateObject private var motion = CardMotionController()

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let swipeThreshold: CGFloat = 72
    private var isTop: Bool { depth == 0 }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                cardFaces
                .background { CardDesignBackground(design: card.cardDesign) }
                .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
                .overlay {
                    if isTop {
                        CardGlossOverlay(tilt: motion.tilt)
                            .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
                            .allowsHitTesting(false)
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: 32, style: .continuous)
                        .stroke(.white.opacity(isTop ? 0.13 : 0.07), lineWidth: 1)
                }
                .shadow(color: .black.opacity(isTop ? 0.26 : 0.12), radius: 24, y: 14)
                .scaleEffect(1 - CGFloat(depth) * 0.045)
                .offset(
                    x: isTop ? offset.width : CGFloat(depth.isMultiple(of: 2) ? -5 : 7),
                    y: isTop ? offset.height * 0.3 : CGFloat(depth) * 10
                )
                .rotationEffect(.degrees(isTop ? rotation : 0))
                .rotation3DEffect(
                    .degrees(isTop ? Double(-offset.height / max(geo.size.height, 1)) * 7 + motion.tilt.height : 0),
                    axis: (x: 1, y: 0, z: 0),
                    perspective: 0.7
                )
                .rotation3DEffect(
                    .degrees(isTop ? Double(offset.width / max(geo.size.width, 1)) * 8 + motion.tilt.width : 0),
                    axis: (x: 0, y: 1, z: 0),
                    perspective: 0.7
                )
                .onTapGesture {
                    guard isTop, !isCompletingSwipe, abs(offset.width) < 8 else { return }
                    if let onOpenDetail {
                        onOpenDetail(card)
                    } else {
                        showDetail = true
                        HapticsManager.shared.impact(.light)
                    }
                }
                .animation(.spring(response: 0.46, dampingFraction: 0.82), value: offset)

                if isTop {
                    if offset.width > 30 { likeIndicator }
                    if offset.width < -30 { dislikeIndicator }
                }

                if isTop && showDetail {
                    ProfileDetailSheet(card: card) {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.88)) { showDetail = false }
                    }
                    .environmentObject(theme)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .transition(.scale(scale: 0.92).combined(with: .opacity))
                    .zIndex(20)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .contentShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            .highPriorityGesture(isTop && !showDetail ? dragGesture(size: geo.size) : nil, including: .all)
            .onAppear { updateMotionState() }
            .onChange(of: isTop) { _ in updateMotionState() }
            .onDisappear { motion.stop() }
        }
        .frame(height: 474)
        .allowsHitTesting(isTop && !isCompletingSwipe)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("feed.card.\(card.userId)")
    }

    private var cardFaces: some View {
        ProfileExchangeCardFace(card: card)
    }

    private func updateMotionState() {
        if isTop && !reduceMotion { motion.start() } else { motion.stop() }
    }

    private func dragGesture(size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 6, coordinateSpace: .global)
            .onChanged { value in
                guard !isCompletingSwipe else { return }
                offset = value.translation
                rotation = Double(value.translation.width / size.width) * 15
            }
            .onEnded { value in
                guard !isCompletingSwipe else { return }
                let projectedWidth = value.predictedEndTranslation.width
                if max(value.translation.width, projectedWidth) > SwipeCard.swipeThreshold {
                    flyOff(direction: .right)
                } else if min(value.translation.width, projectedWidth) < -SwipeCard.swipeThreshold {
                    flyOff(direction: .left)
                } else {
                    withAnimation(.spring()) { offset = .zero; rotation = 0 }
                }
            }
    }

    private func flyOff(direction: SwipeDirection) {
        isCompletingSwipe = true
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

    private var likeIndicator: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: 68, weight: .bold))
            .foregroundStyle(.white)
            .padding(26)
            .background(.green.opacity(0.86), in: Circle())
            .shadow(color: .black.opacity(0.22), radius: 16, y: 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(Double(min(offset.width / SwipeCard.swipeThreshold, 1.0)))
    }

    private var dislikeIndicator: some View {
        Image(systemName: "xmark")
            .font(.system(size: 72, weight: .black))
            .foregroundStyle(.white)
            .padding(26)
            .background(.red.opacity(0.86), in: Circle())
            .shadow(color: .black.opacity(0.22), radius: 16, y: 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(Double(min(-offset.width / SwipeCard.swipeThreshold, 1.0)))
    }
}

struct ProfileExchangeCardFace: View {
    let card: ProfileCard
    @Environment(\.colorScheme) private var colorScheme

    private var foreground: Color {
        card.cardDesign.foregroundColor(for: colorScheme)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                AvatarView(url: card.avatarUrl, size: 50, showBorder: false)
                Text(card.username)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(foreground)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if !card.matchingOwnedGames.isEmpty {
                    Label("\(card.matchingOwnedGames.count)", systemImage: "checkmark.seal.fill")
                        .font(.system(size: 12, weight: .black, design: .rounded))
                        .foregroundStyle(Color(hex: "#42E58B"))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color(hex: "#073B28").opacity(0.78), in: Capsule())
                        .overlay(Capsule().stroke(Color(hex: "#42E58B").opacity(0.65), lineWidth: 1))
                        .accessibilityLabel("feed.match.marker".localized)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 22)

            Spacer(minLength: 10)

            PlatformGamesPanel(card: card, foreground: foreground)
                .frame(height: 252)

            VStack(alignment: .leading, spacing: 8) {
                Text("profile.wanted".localized)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(foreground)

                if card.wantedGames.isEmpty {
                    Text("—")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(foreground.opacity(0.35))
                        .frame(height: 54)
                } else {
                    GameArtworkMarquee(
                        tags: card.wantedGameTags,
                        fallbackNames: card.wantedGames,
                        movesForward: false,
                        artworkSize: 50,
                        accent: foreground,
                        highlightedNames: card.matchingOwnedGames
                    )
                    .frame(height: 54)
                    .padding(.horizontal, -22)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)

            Spacer(minLength: 2)

            HStack {
                Text("feed.card.open".localized)
                    .font(.system(size: 11, weight: .semibold))
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(foreground.opacity(0.42))
            .padding(.horizontal, 22)
            .padding(.bottom, 14)
        }
    }
}

private struct PlatformGamesPanel: View {
    let card: ProfileCard
    let foreground: Color

    private var platforms: [Platform] {
        let populated = card.platforms.filter { !(card.platformGames[$0.rawValue] ?? []).isEmpty }
        return Array((populated.isEmpty ? card.platforms : populated).prefix(3))
    }

    var body: some View {
        VStack(spacing: 0) {
            if platforms.isEmpty {
                GameArtworkMarquee(
                    tags: card.tags,
                    fallbackNames: card.tags.map(\.name),
                    movesForward: true,
                    artworkSize: 56,
                    accent: foreground
                )
                .frame(height: 58)
            } else {
                ForEach(Array(platforms.enumerated()), id: \.element.rawValue) { index, platform in
                    VStack(alignment: .leading, spacing: 7) {
                        platformPill(platform)
                            .padding(.horizontal, 22)
                        GameArtworkMarquee(
                            tags: card.platformGameTags[platform.rawValue] ?? [],
                            fallbackNames: card.platformGames[platform.rawValue] ?? [],
                            movesForward: index.isMultiple(of: 2),
                            artworkSize: 56,
                            accent: foreground
                        )
                        .frame(height: 58)
                    }
                    .frame(height: 84)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func platformPill(_ platform: Platform) -> some View {
        HStack(spacing: 7) {
            BrandIcon(assetName: platform.brandAssetName, systemName: platform.icon)
                .frame(width: 13, height: 13)
            Text(platform.rawValue)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .lineLimit(1)
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(foreground.opacity(0.08), in: Capsule())
        .overlay(Capsule().stroke(foreground.opacity(0.28), lineWidth: 1))
    }
}

struct ProfileSkillsCardFace: View {
    let card: ProfileCard
    var onOpenProfile: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                AvatarView(url: card.avatarUrl, size: 50, showBorder: false)
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.username)
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                    Text("profile.card.skills".localized.uppercased())
                        .font(.system(size: 10, weight: .black))
                        .foregroundStyle(.white.opacity(0.5))
                }
                Spacer()
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(22)

            if let description = card.skillsDescription, !description.isEmpty {
                Text(description)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.78))
                    .lineLimit(4)
                    .padding(.horizontal, 22)
            }

            ScrollView {
                FlowLayout(spacing: 9) {
                    ForEach(card.skills, id: \.self) { skill in
                        Text(skill)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.white.opacity(0.1), in: Capsule())
                            .overlay(Capsule().stroke(.white.opacity(0.22), lineWidth: 1))
                    }
                }
                .padding(22)
            }
            .scrollDisabled(true)

            Spacer(minLength: 10)

            if let onOpenProfile {
                Button(action: onOpenProfile) {
                    HStack {
                        Text("feed.card.open".localized)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 22)
                .padding(.bottom, 20)
            }
        }
        .foregroundStyle(.white)
    }
}

struct ProfileCardPreview: View {
    let card: ProfileCard
    @Binding var isShowingSkills: Bool
    @State private var renderedCard: ProfileCard
    @State private var tilt = CGSize.zero

    init(card: ProfileCard, isShowingSkills: Binding<Bool>) {
        self.card = card
        _isShowingSkills = isShowingSkills
        _renderedCard = State(initialValue: card)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ProfileExchangeCardFace(card: renderedCard)
                    .opacity(isShowingSkills ? 0 : 1)
                ProfileSkillsCardFace(card: renderedCard)
                    .background(Color.black.opacity(0.38))
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                    .opacity(isShowingSkills ? 1 : 0)
            }
            .background { CardDesignBackground(design: renderedCard.cardDesign) }
            .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 32).stroke(.white.opacity(0.14)))
            .shadow(color: .black.opacity(0.24), radius: 24, y: 14)
            .rotation3DEffect(.degrees(isShowingSkills ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.72)
            .rotation3DEffect(.degrees(Double(-tilt.height / max(geometry.size.height, 1)) * 10), axis: (x: 1, y: 0, z: 0), perspective: 0.72)
            .rotation3DEffect(.degrees(Double(tilt.width / max(geometry.size.width, 1)) * 10), axis: (x: 0, y: 1, z: 0), perspective: 0.72)
            .contentShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { tilt = $0.translation }
                    .onEnded { value in
                        withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { tilt = .zero }
                        if abs(value.translation.width) < 8 && abs(value.translation.height) < 8 {
                            withAnimation(.spring(response: 0.52, dampingFraction: 0.82)) { isShowingSkills.toggle() }
                            HapticsManager.shared.impact(.light)
                        }
                    }
            )
        }
        .frame(height: 474)
        .accessibilityHint("profile.card.flip".localized)
        .task(id: card.userId) { await enrichCovers() }
    }

    private func enrichCovers() async {
        renderedCard = await ProfileCardArtworkLoader.enrich(card)
    }
}

enum ProfileCardArtworkLoader {
    static func enrich(_ card: ProfileCard, limit: Int = 24) async -> ProfileCard {
        let names = Array(Set(
            card.tags.map(\.name)
                + card.wantedGames
                + card.platformGames.values.flatMap { $0 }
        ))
        var covers: [String: String] = [:]
        await withTaskGroup(of: (String, String?).self) { group in
            for name in names.prefix(limit) {
                group.addTask {
                    (name, await AppEnvironment.shared.rawg.searchGames(name).first?.backgroundImage)
                }
            }
            for await (name, url) in group {
                if let url { covers[name] = url }
            }
        }

        var updated = card
        updated.tags = card.tags.map { GameTag(name: $0.name, coverUrl: covers[$0.name], rawgId: $0.rawgId) }
        updated.wantedGameTags = card.wantedGames.map { GameTag(name: $0, coverUrl: covers[$0]) }
        updated.platformGameTags = card.platformGames.mapValues { names in
            names.map { GameTag(name: $0, coverUrl: covers[$0]) }
        }
        return updated
    }
}

struct GameArtworkMarquee: View {
    let tags: [GameTag]
    let fallbackNames: [String]
    let movesForward: Bool
    var artworkSize: CGFloat = 64
    var accent: Color = .white
    var highlightedNames: Set<String> = []
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var items: [GameTag] {
        if !tags.isEmpty { return tags }
        return fallbackNames.map { GameTag(name: $0) }
    }

    var body: some View {
        GeometryReader { geometry in
            if !items.isEmpty {
                let stride = artworkSize + 12
                let cycleWidth = CGFloat(items.count) * stride
                let repetitions = max(3, Int(ceil(geometry.size.width / cycleWidth)) + 2)
                let duration = max(Double(cycleWidth / 12), 4)

                TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: reduceMotion)) { timeline in
                    let progress = timeline.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: duration) / duration
                    HStack(spacing: 12) {
                        ForEach(0..<(items.count * repetitions), id: \.self) { index in
                            let tag = items[index % items.count]
                            CompactGameArtwork(
                                tag: tag,
                                size: artworkSize,
                                accent: accent,
                                isMatched: highlightedNames.contains(GameNameValidator.normalized(tag.name))
                            )
                        }
                    }
                    .fixedSize(horizontal: true, vertical: false)
                    .offset(x: reduceMotion ? 0 : movesForward
                        ? -cycleWidth * CGFloat(progress)
                        : -cycleWidth + cycleWidth * CGFloat(progress)
                    )
                }
            }
        }
        .clipped()
    }

}

private struct CompactGameArtwork: View {
    let tag: GameTag
    let size: CGFloat
    let accent: Color
    let isMatched: Bool
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Circle()
                .fill(accent.opacity(0.12))

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipped()
            } else {
                Text(String(tag.name.prefix(2)).uppercased())
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundStyle(accent.opacity(0.72))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            Circle()
                .strokeBorder(
                    isMatched ? Color(hex: "#42E58B") : accent.opacity(0.58),
                    lineWidth: isMatched ? 3 : 1.5
                )
        }
        .shadow(color: isMatched ? Color(hex: "#42E58B").opacity(0.72) : .clear, radius: 10)
        .accessibilityLabel(tag.name)
        .task(id: tag.coverUrl) {
            guard let coverUrl = tag.coverUrl else { return }
            image = await GameIconCacheService.shared.loadImage(from: coverUrl)
        }
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
    var showsSkills = false
    var onClose: (() -> Void)? = nil

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @State private var gameQuery = ""
    @State private var appeared = false
    @State private var selectedGame: RawgGame?

    var body: some View {
        ZStack {
            CardDesignBackground(design: card.cardDesign)
            Color.black.opacity(card.cardDesign == .classic ? 0.48 : 0.38)

            VStack(spacing: 0) {
                detailHeader
                if !showsSkills { gameSearchField }

                ScrollView(showsIndicators: false) {
                    Group {
                        if showsSkills {
                            skillsDetails
                        } else {
                            gamesDetails
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 22)
                }
            }
            .frame(maxWidth: 760)
            .background(.clear)
            .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 34, style: .continuous)
                    .stroke(.white.opacity(0.16), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.24), radius: 26, y: 12)
            .scaleEffect(appeared ? 1 : 0.9)
            .opacity(appeared ? 1 : 0)
        }
        .preferredColorScheme(.dark)
        .onAppear {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) { appeared = true }
        }
        .sheet(item: $selectedGame) { game in
            GameDetailView(game: game).environmentObject(theme)
        }
    }

    private var gamesDetails: some View {
        LazyVStack(alignment: .leading, spacing: 20) {
            ForEach(visiblePlatformSections, id: \.platform.rawValue) { section in
                gameSection(
                    title: section.platform.rawValue,
                    platform: section.platform,
                    games: section.games,
                    tags: card.platformGameTags[section.platform.rawValue] ?? []
                )
            }

            if !visibleWantedGames.isEmpty {
                gameSection(
                    title: "profile.wanted".localized,
                    platform: nil,
                    games: visibleWantedGames,
                    tags: card.wantedGameTags
                )
            }

            if visiblePlatformSections.isEmpty && visibleWantedGames.isEmpty {
                detailEmptyState(
                    icon: "magnifyingglass",
                    title: "search.empty.title".localized,
                    subtitle: "profile.games.search.empty".localized
                )
            }
        }
    }

    private var skillsDetails: some View {
        LazyVStack(alignment: .leading, spacing: 18) {
            if let description = card.skillsDescription, !description.isEmpty {
                Text(description)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white.opacity(0.78))
                    .fixedSize(horizontal: false, vertical: true)
            }

            if card.skills.isEmpty {
                detailEmptyState(
                    icon: "bolt.slash",
                    title: "feed.empty".localized,
                    subtitle: "feed.empty.subtitle".localized
                )
            } else {
                FlowLayout(spacing: 10) {
                    ForEach(card.skills, id: \.self) { skill in
                        Text(skill)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(.white.opacity(0.11), in: Capsule())
                            .overlay(Capsule().stroke(.white.opacity(0.2), lineWidth: 1))
                    }
                }
            }
        }
    }

    private func detailEmptyState(icon: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 36, weight: .medium))
            Text(title)
                .font(.system(size: 19, weight: .bold))
            Text(subtitle)
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.62))
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.top, 70)
    }

    private var detailHeader: some View {
        HStack(spacing: 12) {
            AvatarView(url: card.avatarUrl, size: 48, showBorder: true)
            VStack(alignment: .leading, spacing: 3) {
                Text(card.username)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                if let status = card.status, !status.isEmpty {
                    Text(status)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)
                }
            }
            Spacer()
            Button { onClose?() ?? dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(.white.opacity(0.1), in: Circle())
            }
            .accessibilityLabel("common.close".localized)
            .accessibilityIdentifier("profile.detail.close")
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 14)
    }

    private var gameSearchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.white.opacity(0.55))
            TextField("profile.games.search".localized, text: $gameQuery)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(.white)
            if !gameQuery.isEmpty {
                Button { gameQuery = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 46)
        .background(.white.opacity(0.09), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .padding(.horizontal, 20)
    }

    private func gameSection(title: String, platform: Platform?, games: [String], tags: [GameTag]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let platform { PlatformBadge(platform: platform, size: 20) }
                Text(title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }

            ForEach(games, id: \.self) { game in
                let tag = tags.first(where: { normalized($0.name) == normalized(game) })
                Button {
                    selectedGame = RawgGame(
                        id: tag?.rawgId ?? Int.min,
                        name: game,
                        backgroundImage: tag?.coverUrl
                    )
                } label: {
                    ExpandedGameRow(name: game, coverURL: tag?.coverUrl)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var visiblePlatformSections: [(platform: Platform, games: [String])] {
        card.platforms.compactMap { platform in
            let games = (card.platformGames[platform.rawValue] ?? []).filter(matchesQuery)
            return games.isEmpty ? nil : (platform, games)
        }
    }

    private var visibleWantedGames: [String] {
        card.wantedGames.filter(matchesQuery)
    }

    private func matchesQuery(_ name: String) -> Bool {
        gameQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            normalized(name).contains(normalized(gameQuery))
    }

    private func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    }
}

struct CachedRemoteImage: View {
    let url: String?
    var contentMode: ContentMode = .fill
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                ZStack {
                    Color.white.opacity(0.08)
                    Image(systemName: "gamecontroller.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .clipped()
        .task(id: url) {
            image = nil
            guard let url else { return }
            image = await GameIconCacheService.shared.loadImage(from: url)
        }
    }
}

struct GameDetailView: View {
    let game: RawgGame
    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var details: RawgGame?
    @State private var isLoading = true

    private var value: RawgGame { details ?? game }

    var body: some View {
        NavigationView {
            ZStack {
                BrandBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        CachedRemoteImage(url: value.backgroundImage)
                            .frame(maxWidth: .infinity)
                            .aspectRatio(16 / 9, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

                        Text(value.name)
                            .font(.system(size: 28, weight: .heavy, design: .rounded))
                            .foregroundStyle(theme.effectiveTextColor)

                        HStack(spacing: 10) {
                            if let rating = value.rating { metric("star.fill", String(format: "%.1f", rating)) }
                            if let metacritic = value.metacritic { metric("m.square.fill", "\(metacritic)") }
                            if let playtime = value.playtime { metric("clock.fill", "\(playtime) h") }
                        }

                        if let platforms = value.platforms, !platforms.isEmpty {
                            detailSection("game.details.platforms".localized, text: platforms.joined(separator: " · "))
                        }
                        if let genres = value.genres, !genres.isEmpty {
                            detailSection("game.details.genres".localized, text: genres.joined(separator: " · "))
                        }
                        if let released = value.released, !released.isEmpty {
                            detailSection("game.details.release".localized, text: released)
                        }
                        if let description = value.descriptionRaw, !description.isEmpty {
                            detailSection("game.details.about".localized, text: description)
                        } else if isLoading {
                            ProgressView().frame(maxWidth: .infinity)
                        }
                        if let website = value.website, let url = URL(string: website) {
                            Button { openURL(url) } label: {
                                Label("game.details.website".localized, systemImage: "safari")
                                    .font(.system(size: 15, weight: .bold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(theme.effectivePrimary)
                        }
                    }
                    .padding(18)
                }
            }
            .navigationTitle("game.details.title".localized)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark.circle.fill") }
                }
            }
        }
        .task { await loadDetails() }
    }

    private func metric(_ icon: String, _ text: String) -> some View {
        Label(text, systemImage: icon)
            .font(.system(size: 12, weight: .bold))
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .adaptiveGlass(in: Capsule())
    }

    private func detailSection(_ title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(theme.effectiveSecondaryTextColor)
            Text(text).font(.system(size: 15)).foregroundStyle(theme.effectiveTextColor).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func loadDetails() async {
        defer { isLoading = false }
        if game.id > 0 {
            details = await AppEnvironment.shared.rawg.getGame(id: game.id)
        } else {
            guard let match = await AppEnvironment.shared.rawg.searchGames(game.name).first(where: { $0.id > 0 }) else { return }
            details = await AppEnvironment.shared.rawg.getGame(id: match.id) ?? match
        }
    }
}

private struct ExpandedGameRow: View {
    let name: String
    let coverURL: String?
    @State private var image: UIImage?

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(.white.opacity(0.1))
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: "gamecontroller.fill")
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            .frame(width: 52, height: 52)
            .clipShape(Circle())
            .overlay(Circle().stroke(.white.opacity(0.2), lineWidth: 1))

            Text(name)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .task(id: coverURL) {
            guard let coverURL else { return }
            image = await GameIconCacheService.shared.loadImage(from: coverURL)
        }
    }
}
