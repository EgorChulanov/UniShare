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
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Top segment picker (Exchange / Skills)
                segmentPicker
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                // Cards
                ZStack {
                    if vm.isLoading {
                        ProgressView()
                            .tint(theme.effectivePrimary)
                            .scaleEffect(1.5)
                    } else if vm.selectedSegment == .exchange {
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
                .padding(.horizontal, 16)
                .frame(maxHeight: .infinity)

                // Small AirShare link at bottom
                Button {
                    TabBarState.shared.showAirShare = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "wave.3.forward")
                            .font(.system(size: 12))
                        Text("AirShare")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .padding(.vertical, 10)
                }
            }
        }
        .task { await vm.loadInitialCards() }
    }

    // MARK: - Segment Picker

    private var segmentPicker: some View {
        HStack(spacing: 0) {
            ForEach(FeedSegment.allCases, id: \.rawValue) { segment in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        vm.selectedSegment = segment
                    }
                } label: {
                    Text(segment.localizedKey.localized)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(vm.selectedSegment == segment ? .white : theme.effectiveSecondaryTextColor)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(
                            vm.selectedSegment == segment
                                ? LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .leading, endPoint: .trailing)
                                : LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing)
                        )
                        .cornerRadius(10)
                }
            }
        }
        .padding(4)
        .glass(cornerRadius: 14)
    }
}
