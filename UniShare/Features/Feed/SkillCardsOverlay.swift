import SwiftUI

struct SkillCardsOverlay: View {
    let cards: [ProfileCard]
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        ZStack {
            if cards.isEmpty {
                VStack(spacing: 14) {
                    Image(systemName: "person.2.slash.fill")
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
            } else {
                ForEach(Array(Array(cards.prefix(3).enumerated()).reversed()), id: \.element.id) { item in
                    SkillSwipeCard(
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
}

struct SkillSwipeCard: View {
    let card: ProfileCard
    let isTop: Bool
    let stackDepth: Int
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @State private var offset: CGSize = .zero
    @State private var rotation = 0.0
    @State private var showDetail = false

    private static let swipeThreshold: CGFloat = 105

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
        .sheet(isPresented: $showDetail) { ProfileDetailSheet(card: card) }
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
                .offset(x: 145, y: -220)

            VStack(alignment: .leading, spacing: 0) {
                header
                Spacer(minLength: 24)

                if let platform = card.platform ?? card.platforms.first {
                    platformPill(platform)
                        .padding(.bottom, 24)
                }

                Text("profile.skills".localized)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.bottom, 12)

                if card.skills.isEmpty {
                    Text("skills.empty".localized)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.48))
                } else {
                    FlowLayout(spacing: 9) {
                        ForEach(card.skills, id: \.self) { skill in
                            Text(skill)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(.white.opacity(0.10), in: Capsule())
                                .overlay(Capsule().stroke(.white.opacity(0.18)))
                        }
                    }
                }

                Spacer(minLength: 18)

                HStack {
                    Text("feed.card.tap_details".localized)
                        .font(.system(size: 11, weight: .semibold))
                    Spacer()
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundStyle(.white.opacity(0.48))
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
        .overlay(RoundedRectangle(cornerRadius: 34, style: .continuous).stroke(.white.opacity(0.12)))
        .shadow(color: .black.opacity(0.28), radius: 24, y: 14)
    }

    private var header: some View {
        HStack(spacing: 13) {
            AvatarView(url: card.avatarUrl, size: 54, showBorder: false)
                .overlay(Circle().stroke(.white.opacity(0.22)))
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
        .overlay(Capsule().stroke(.white.opacity(0.35)))
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
