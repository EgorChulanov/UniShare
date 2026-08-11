import SwiftUI

struct FeedView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: FeedViewModel
    @State private var selectedStory: CommunityStory?
    @State private var storiesCollapsed = false

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
            BrandBackground()

            VStack(spacing: 0) {
                if !vm.stories.isEmpty {
                    if storiesCollapsed {
                        VStack(spacing: 2) {
                            Capsule()
                                .fill(theme.effectiveSecondaryTextColor.opacity(0.45))
                                .frame(width: 34, height: 3)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(theme.effectiveSecondaryTextColor.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 3)
                        .contentShape(Rectangle())
                        .onTapGesture { revealStories() }
                        .gesture(
                            DragGesture(minimumDistance: 8).onEnded { value in
                                guard value.translation.height > 16 else { return }
                                revealStories()
                            }
                        )
                    } else {
                        CommunityStoriesRail(stories: vm.stories) { story in
                            selectedStory = story
                            Task { await vm.markStoryViewed(story) }
                        }
                        .environmentObject(theme)
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }

                // ── Segment picker — flush below status bar ──
                segmentPicker
                    .padding(.horizontal, 20)
                    .padding(.top, 5)
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
                        Text("feed.airshare.nearby".localized)
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .padding(.bottom, 12)
                }
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 18).onChanged { value in
                    guard !storiesCollapsed,
                          value.translation.height < -22,
                          abs(value.translation.height) > abs(value.translation.width) else { return }
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) { storiesCollapsed = true }
                }
            )
        }
        .task { await vm.loadInitialCards() }
        .alert("common.error".localized, isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("common.ok".localized, role: .cancel) {}
        } message: {
            Text(vm.errorMessage ?? "")
        }
        .fullScreenCover(item: $selectedStory) { story in
            CommunityStoryViewer(story: story)
                .environmentObject(theme)
        }
    }

    private func revealStories() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) { storiesCollapsed = false }
    }

    // MARK: - Segment picker

    private var segmentPicker: some View {
        LiquidSegmentedPicker(
            options: FeedSegment.allCases,
            selection: $vm.selectedSegment,
            title: { $0.localizedKey.localized }
        )
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
            .accessibilityIdentifier("feed.dislike")

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
                .accessibilityIdentifier("feed.undo")
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
            .accessibilityIdentifier("feed.like")
        }
    }
}
