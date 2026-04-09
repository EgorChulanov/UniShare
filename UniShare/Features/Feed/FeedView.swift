import SwiftUI

struct FeedView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: FeedViewModel

    init() {
        _vm = StateObject(wrappedValue: FeedViewModel(
            auth: FirebaseAuthService(),
            firestore: FirestoreService(),
            rawg: RawgService()
        ))
    }

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Segment picker
                    segmentPicker

                    // Search bar
                    searchBar
                        .padding(.horizontal, 16)
                        .padding(.top, 8)

                    // Cards
                    ZStack {
                        if vm.isLoading {
                            ProgressView()
                                .tint(theme.effectivePrimary)
                                .scaleEffect(1.5)
                        } else {
                            if vm.selectedSegment == .exchange {
                                FeedCardsOverlay(
                                    cards: vm.exchangeCards,
                                    onSwipeRight: { card in
                                        Task { await vm.swipeRight(card: card, requestType: "exchange") }
                                    },
                                    onSwipeLeft: { card in
                                        vm.swipeLeft(card: card, requestType: "exchange")
                                    }
                                )
                            } else {
                                SkillCardsOverlay(
                                    cards: vm.skillCards,
                                    onSwipeRight: { card in
                                        Task { await vm.swipeRight(card: card, requestType: "skills") }
                                    },
                                    onSwipeLeft: { card in
                                        vm.swipeLeft(card: card, requestType: "skills")
                                    }
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .frame(maxHeight: .infinity)

                    // Action buttons
                    actionButtons
                        .padding(.bottom, 8)
                }
            }
            .navigationTitle("tab.feed".localized)
            .navigationBarTitleDisplayMode(.large)
        }
        .task {
            await vm.loadInitialCards()
        }
    }

    // MARK: - Segment Picker

    private var segmentPicker: some View {
        HStack(spacing: 0) {
            ForEach(FeedSegment.allCases, id: \.rawValue) { segment in
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        vm.selectedSegment = segment
                    }
                } label: {
                    Text(segment.localizedKey.localized)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(vm.selectedSegment == segment ? .white : theme.effectiveSecondaryTextColor)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(
                            vm.selectedSegment == segment ?
                            LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .leading, endPoint: .trailing) :
                            LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing)
                        )
                        .cornerRadius(10)
                }
            }
        }
        .padding(4)
        .glass(cornerRadius: 14)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(theme.effectiveSecondaryTextColor)
            TextField("feed.search.placeholder".localized, text: $vm.searchQuery)
                .foregroundColor(theme.effectiveTextColor)
                .accentColor(theme.effectivePrimary)
                .onChange(of: vm.searchQuery) { vm.searchGames($0) }
            if vm.isSearching {
                ProgressView().scaleEffect(0.8).tint(theme.effectivePrimary)
            }
            if !vm.searchQuery.isEmpty {
                Button { vm.searchQuery = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glass(cornerRadius: 12)
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 32) {
            // Dislike
            Button {
                let cards = vm.selectedSegment == .exchange ? vm.exchangeCards : vm.skillCards
                if let top = cards.first {
                    vm.swipeLeft(card: top, requestType: vm.selectedSegment.requestType)
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.red)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.red.opacity(0.15)))
            }

            // AirShare shortcut
            Button {
                TabBarState.shared.showAirShare = true
            } label: {
                Image(systemName: "wave.3.forward")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(theme.effectivePrimary)
                    .frame(width: 44, height: 44)
                    .glass(cornerRadius: 22)
            }

            // Undo
            Button {
                vm.undo(requestType: vm.selectedSegment.requestType)
            } label: {
                Image(systemName: "arrow.uturn.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(vm.canUndo ? theme.effectiveTertiary : theme.effectiveSecondaryTextColor)
                    .frame(width: 44, height: 44)
                    .glass(cornerRadius: 22)
            }
            .disabled(!vm.canUndo)

            // Like
            Button {
                let cards = vm.selectedSegment == .exchange ? vm.exchangeCards : vm.skillCards
                if let top = cards.first {
                    Task { await vm.swipeRight(card: top, requestType: vm.selectedSegment.requestType) }
                }
            } label: {
                Image(systemName: "heart.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.green)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.green.opacity(0.15)))
            }
        }
        .padding(.top, 12)
    }
}
