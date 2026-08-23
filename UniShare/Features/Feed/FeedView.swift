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
        vm.selectedSegment == .teammates ? vm.teammateCards : vm.skillCards
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

                HStack(spacing: 10) {
                    segmentPicker

                    Button { TabBarState.shared.showAirShare = true } label: {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(theme.effectiveTextColor)
                            .frame(width: 42, height: 42)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("feed.airshare.nearby".localized)
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .padding(.bottom, 10)

                // ── Card stack ──
                ZStack {
                    if vm.isLoading {
                        ProgressView()
                            .tint(theme.effectivePrimary)
                            .scaleEffect(1.4)
                    } else if vm.selectedSegment == .teammates {
                        FeedCardsOverlay(
                            cards: vm.teammateCards,
                            onSwipeRight: { card in Task { await vm.swipeRight(card: card, requestType: "teammates") } },
                            onSwipeLeft:  { card in vm.swipeLeft(card: card, requestType: "teammates") }
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
                .padding(.bottom, 24)
                .frame(maxHeight: .infinity)
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

}
