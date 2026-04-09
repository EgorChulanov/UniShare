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
            ZStack(alignment: .bottomLeading) {
                // Background
                LinearGradient(
                    colors: [theme.effectiveTertiary.opacity(0.6), theme.effectiveBackground],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                // Avatar top
                if let url = card.avatarUrl {
                    VStack {
                        AsyncImageView(url: url)
                            .frame(height: geo.size.height * 0.5)
                            .clipped()
                        Spacer()
                    }
                }

                // Gradient overlay
                LinearGradient(
                    colors: [Color.clear, Color.black.opacity(0.9)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                // Swipe indicators
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

                // Info
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(card.username)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.white)
                        Spacer()
                    }

                    if !card.skills.isEmpty {
                        FlowLayout(spacing: 6) {
                            ForEach(card.skills.prefix(5), id: \.self) { skill in
                                Text(skill)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Color.white.opacity(0.2))
                                    .cornerRadius(16)
                            }
                        }
                    }

                    if !card.platforms.isEmpty {
                        PlatformBadgeRow(platforms: card.platforms, size: 28)
                    }
                }
                .padding()
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .cornerRadius(24)
            .shadow(color: .black.opacity(0.3), radius: 12)
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
