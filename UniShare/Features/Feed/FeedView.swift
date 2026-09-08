import SwiftUI

struct FeedView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: FeedViewModel
    @State private var expandedCard: ProfileCard?
    @State private var expandedCardShowsSkills = false
    init() {
        let env = AppEnvironment.shared
        _vm = StateObject(wrappedValue: FeedViewModel(
            auth: env.auth,
            db: env.db,
            rawg: env.rawg
        ))
    }

    var body: some View {
        ZStack {
            BrandBackground()

            VStack(spacing: 0) {
                segmentPicker
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
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
                            onSwipeLeft:  { card in vm.swipeLeft(card: card, requestType: "exchange") },
                            onOpenDetail: { card in open(card, showsSkills: false) }
                        )
                    } else {
                        SkillCardsOverlay(
                            cards: vm.skillCards,
                            onSwipeRight: { card in Task { await vm.swipeRight(card: card, requestType: "skills") } },
                            onSwipeLeft:  { card in vm.swipeLeft(card: card, requestType: "skills") },
                            onOpenDetail: { card in open(card, showsSkills: true) }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .frame(maxHeight: .infinity)

                // ── AirShare link ──
                Button { TabBarState.shared.showAirShare = true } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 11))
                        Text("feed.airshare.action".localized)
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .padding(.bottom, 12)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            if let expandedCard {
                ProfileDetailSheet(card: expandedCard, showsSkills: expandedCardShowsSkills) {
                    withAnimation(.spring(response: 0.42, dampingFraction: 0.88)) {
                        self.expandedCard = nil
                    }
                }
                .environmentObject(theme)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .transition(.scale(scale: 0.88).combined(with: .opacity))
                .zIndex(20)
            }
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
    }

    private func open(_ card: ProfileCard, showsSkills: Bool) {
        HapticsManager.shared.impact(.light)
        expandedCardShowsSkills = showsSkills
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { expandedCard = card }
    }

    // MARK: - Segment picker

    private var segmentPicker: some View {
        Picker("", selection: $vm.selectedSegment) {
            ForEach(FeedSegment.allCases, id: \.self) { segment in
                Text(localization.localizedString(for: segment.localizedKey)).tag(segment)
            }
        }
        .pickerStyle(.segmented)
        .id(localization.currentLanguage)
        .accessibilityLabel("tab.feed".localized)
    }

}
