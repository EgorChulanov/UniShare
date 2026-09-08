import SwiftUI

// Skills cards use the same SwipeCard component but display skills instead of games
struct SkillCardsOverlay: View {
    let cards: [ProfileCard]
    let onSwipeRight: (ProfileCard) -> Void
    let onSwipeLeft: (ProfileCard) -> Void
    var onOpenDetail: ((ProfileCard) -> Void)? = nil

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
                        onSwipeLeft: onSwipeLeft,
                        onOpenDetail: onOpenDetail
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
    var onOpenDetail: ((ProfileCard) -> Void)? = nil

    @State private var offset: CGSize = .zero
    @State private var rotation: Double = 0
    @State private var showDetail = false
    @State private var isCompletingSwipe = false
    @StateObject private var motion = CardMotionController()
    @EnvironmentObject var theme: ThemeManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let threshold: CGFloat = 72

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ProfileSkillsCardFace(card: card)
                .background {
                    ZStack {
                        CardDesignBackground(design: card.cardDesign)
                        Color.black.opacity(0.48)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
                .overlay {
                    if isTop {
                        CardGlossOverlay(tilt: motion.tilt)
                            .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
                            .allowsHitTesting(false)
                    }
                }
                .overlay(RoundedRectangle(cornerRadius: 32).stroke(.white.opacity(isTop ? 0.14 : 0.07)))
                .shadow(color: .black.opacity(isTop ? 0.26 : 0.12), radius: 24, y: 14)
                .scaleEffect(isTop ? 1.0 : 0.955)
                .offset(x: isTop ? offset.width : 0, y: isTop ? offset.height * 0.3 : 0)
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
                    if offset.width > 30 {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 68, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(26)
                            .background(.green.opacity(0.86), in: Circle())
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .opacity(Double(min(offset.width / threshold, 1.0)))
                    }
                    if offset.width < -30 {
                        Image(systemName: "xmark")
                            .font(.system(size: 72, weight: .black))
                            .foregroundStyle(.white)
                            .padding(26)
                            .background(.red.opacity(0.86), in: Circle())
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .opacity(Double(min(-offset.width / threshold, 1.0)))
                    }
                }

                if isTop && showDetail {
                    ProfileDetailSheet(card: card, showsSkills: true) {
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
        .accessibilityIdentifier("feed.skillCard.\(card.userId)")
    }

    private func dragGesture(size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                guard !isCompletingSwipe else { return }
                offset = value.translation
                rotation = Double(value.translation.width / size.width) * 15
            }
            .onEnded { value in
                guard !isCompletingSwipe else { return }
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
        isCompletingSwipe = true
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

    private func updateMotionState() {
        if isTop && !reduceMotion { motion.start() } else { motion.stop() }
    }
}
