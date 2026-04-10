import SwiftUI

// Skills cards use the same SwipeCard component but display skills instead of games
struct SkillCardsOverlay: View {
    let cards: [ProfileCard]
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        ZStack {
            if cards.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "person.2.slash.fill")
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
            } else {
                ForEach(cards.prefix(3).reversed()) { card in
                    SkillSwipeCard(
                        card: card,
                        isTop: card.id == cards.first?.id,
                        onSwipeRight: onSwipeRight,
                        onSwipeLeft: onSwipeLeft
                    )
                }
            }
        }
    }
}

// MARK: - SkillSwipeCard

struct SkillSwipeCard: View {
    let card: ProfileCard
    let isTop: Bool
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void

    @State private var offset: CGSize = .zero
    @State private var rotation: Double = 0
    @EnvironmentObject var theme: ThemeManager

    private let threshold: CGFloat = 100

    var body: some View {
        GeometryReader { geo in
            ZStack {
                VStack(spacing: 0) {
                    // Top info
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
                            HStack(spacing: 5) {
                                ForEach(card.platforms, id: \.rawValue) { p in PlatformBadge(platform: p, size: 16) }
                            }
                        }
                        Spacer()
                    }
                    .padding(16)

                    Divider().background(theme.effectiveBackground.opacity(0.4))

                    // Skills section
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            if !card.skills.isEmpty {
                                Text("Skills")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(theme.effectiveTertiary)
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
                            } else {
                                Text("No skills listed")
                                    .font(.system(size: 13))
                                    .foregroundColor(theme.effectiveSecondaryTextColor)
                                    .padding(16)
                            }
                        }
                        .padding(.vertical, 12)
                    }
                    Spacer(minLength: 0)
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
                    if offset.width > 30 {
                        Text("MATCH")
                            .font(.system(size: 22, weight: .heavy))
                            .foregroundColor(.green)
                            .padding(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.green, lineWidth: 3))
                            .rotationEffect(.degrees(-15))
                            .padding(16)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            .opacity(Double(min(offset.width / threshold, 1.0)))
                    }
                    if offset.width < -30 {
                        Text("PASS")
                            .font(.system(size: 22, weight: .heavy))
                            .foregroundColor(.red)
                            .padding(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.red, lineWidth: 3))
                            .rotationEffect(.degrees(15))
                            .padding(16)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                            .opacity(Double(min(-offset.width / threshold, 1.0)))
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(height: 460)
    }

    private func dragGesture(size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                offset = value.translation
                rotation = Double(value.translation.width / size.width) * 15
            }
            .onEnded { value in
                if value.translation.width > threshold {
                    flyOff(.right)
                } else if value.translation.width < -threshold {
                    flyOff(.left)
                } else {
                    withAnimation(.spring()) { offset = .zero; rotation = 0 }
                }
            }
    }

    private func flyOff(_ direction: SwipeDirection) {
        let x: CGFloat = direction == .right ? 600 : -600
        withAnimation(.easeIn(duration: 0.25)) {
            offset = CGSize(width: x, height: offset.height)
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
}
