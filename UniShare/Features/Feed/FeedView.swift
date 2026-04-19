import SwiftUI

struct FeedView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: FeedViewModel

    init() {
        let env = AppEnvironment.shared
        _vm = StateObject(wrappedValue: FeedViewModel(
            auth: env.auth,
            db: env.db,
            rawg: env.rawg
        ))
    }

    private var currentCards: [ProfileCard] {
        vm.selectedSegment == .exchange ? vm.exchangeCards : vm.skillCards
    }

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()
            GrainOverlay(opacity: 0.14)

            VStack(spacing: 0) {
                // ── Segment picker — flush below status bar ──
                segmentPicker
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 10)

                // ── Card stack ──
                ZStack {
                    if vm.isLoading {
                        ProgressView()
                            .tint(theme.effectivePrimary)
                            .scaleEffect(1.4)
                    } else if vm.selectedSegment == .exchange {
                        FeedCardsOverlay(
                            cards: vm.exchangeCards,
                            onSwipeRight: { card in Task { await vm.swipeRight(card: card, requestType: "exchange") } },
                            onSwipeLeft:  { card in vm.swipeLeft(card: card, requestType: "exchange") }
                        )
                    } else {
                        SkillCardsOverlay(
                            cards: vm.skillCards,
                            onSwipeRight: { card in Task { await vm.swipeRight(card: card, requestType: "skills") } },
                            onSwipeLeft:  { card in vm.swipeLeft(card: card, requestType: "skills") }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .frame(maxHeight: .infinity)

                // ── Action buttons (Figma style) ──
                if !currentCards.isEmpty {
                    actionButtons
                        .padding(.top, 12)
                        .padding(.bottom, 8)
                }

                // ── AirShare link ──
                Button { TabBarState.shared.showAirShare = true } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 11))
                        Text("AirShare nearby")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .padding(.bottom, 12)
                }
            }
        }
        .task { await vm.loadInitialCards() }
    }

    // MARK: - Segment picker

    private var segmentPicker: some View {
        HStack(spacing: 0) {
            ForEach(FeedSegment.allCases, id: \.rawValue) { segment in
                let selected = vm.selectedSegment == segment
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { vm.selectedSegment = segment }
                } label: {
                    Text(segment.localizedKey.localized)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(selected ? .white : theme.effectiveSecondaryTextColor)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            Group {
                                if selected {
                                    LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                                   startPoint: .leading, endPoint: .trailing)
                                } else {
                                    LinearGradient(colors: [Color.clear, Color.clear],
                                                   startPoint: .leading, endPoint: .trailing)
                                }
                            }
                        )
                        .clipShape(Capsule())
                        .overlay(
                            Capsule().stroke(
                                selected ? Color.clear : theme.effectiveSecondaryTextColor.opacity(0.35),
                                lineWidth: 1
                            )
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(theme.effectiveCardColor.opacity(0.6))
        .clipShape(Capsule())
    }

    // MARK: - Action buttons

    private var actionButtons: some View {
        let topCard = currentCards.first
        return HStack(spacing: 56) {
            // Dislike
            Button {
                if let card = topCard {
                    vm.swipeLeft(card: card, requestType: vm.selectedSegment.requestType)
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.red.opacity(0.15))
                        .frame(width: 64, height: 64)
                        .overlay(Circle().stroke(Color.red.opacity(0.35), lineWidth: 1.5))
                    Image(systemName: "xmark")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.red)
                }
            }
            .disabled(topCard == nil)

            // Undo
            if vm.canUndo {
                Button {
                    vm.undo(requestType: vm.selectedSegment.requestType)
                } label: {
                    ZStack {
                        Circle()
                            .fill(theme.effectiveCardColor)
                            .frame(width: 44, height: 44)
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    }
                }
            }

            // Like
            Button {
                if let card = topCard {
                    Task { await vm.swipeRight(card: card, requestType: vm.selectedSegment.requestType) }
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.green.opacity(0.15))
                        .frame(width: 64, height: 64)
                        .overlay(Circle().stroke(Color.green.opacity(0.35), lineWidth: 1.5))
                    Image(systemName: "heart.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.green)
                }
            }
            .disabled(topCard == nil)
        }
    }
}
