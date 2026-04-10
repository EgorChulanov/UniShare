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
                // Pill segment picker — small Capsule buttons
                segmentPicker
                    .padding(.horizontal, 16)
                    .padding(.top, 20)
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

                // AirShare link
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

    // MARK: - Pill Segment Picker

    private var segmentPicker: some View {
        HStack(spacing: 8) {
            ForEach(FeedSegment.allCases, id: \.rawValue) { segment in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        vm.selectedSegment = segment
                    }
                } label: {
                    Text(segment.localizedKey.localized)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(vm.selectedSegment == segment ? .white : theme.effectiveSecondaryTextColor)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 8)
                        .background(
                            Group {
                                if vm.selectedSegment == segment {
                                    LinearGradient(
                                        colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                } else {
                                    LinearGradient(
                                        colors: [Color.clear, Color.clear],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                }
                            }
                        )
                        .clipShape(Capsule())
                        .overlay(
                            Capsule().stroke(
                                vm.selectedSegment == segment
                                    ? Color.clear
                                    : theme.effectiveSecondaryTextColor.opacity(0.35),
                                lineWidth: 1
                            )
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}
