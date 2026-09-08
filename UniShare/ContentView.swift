import SwiftUI

struct ContentView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @State private var showGreeting = false
    @State private var greetingDone = false
    @State private var onboardingComplete = false
    @State private var isCheckingOnboarding = true

    var body: some View {
        Group {
#if DEBUG
            if ProcessInfo.processInfo.environment["UNISHARE_UI_CATALOG"] == "search" {
                ProfileSearchView()
            } else if ProcessInfo.processInfo.environment["UNISHARE_UI_CATALOG"] == "cards" {
                CardDesignCatalogView()
            } else if ProcessInfo.processInfo.environment["UNISHARE_UI_CATALOG"] == "stories" {
                StoryCatalogView()
            } else if ProcessInfo.processInfo.environment["UNISHARE_UI_CATALOG"] == "airshare" {
                AirShareView()
            } else if ProcessInfo.processInfo.environment["UNISHARE_UI_CATALOG"] == "airshare-card" {
                AirShareDecisionCatalogView()
            } else if ProcessInfo.processInfo.environment["UNISHARE_UI_CATALOG"] == "tabs" {
                TabBarView()
            } else {
                appContent
            }
#else
            appContent
#endif
        }
        .animation(.easeInOut(duration: 0.3), value: env.auth.isAuthenticated)
        .task { await checkOnboardingStatus() }
        .onChange(of: env.auth.isAuthenticated) { isAuth in
            if isAuth {
                Task { await checkOnboardingStatus() }
            } else {
                resetState()
            }
        }
    }

    private var appContent: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            if env.auth.isAuthenticated {
                if isCheckingOnboarding {
                    // Brief loading while we check onboarding status
                    ProgressView()
                        .tint(theme.effectivePrimary)
                } else if !onboardingComplete {
                    OnboardingView(onComplete: {
                        onboardingComplete = true
                        showGreeting = !AppConstants.isUITesting
                        greetingDone = AppConstants.isUITesting
                        Task { await PushNotificationService.shared.activateForAuthenticatedUser() }
                    })
                } else if showGreeting && !greetingDone {
                    GreetingView(onFinish: {
                        withAnimation(.easeInOut(duration: 0.4)) {
                            greetingDone = true
                            showGreeting = false
                        }
                    })
                } else {
                    TabBarView()
                        .transition(.opacity)
                }
            } else {
                LoginView()
                    .transition(.opacity)
            }
        }
    }

    private func checkOnboardingStatus() async {
        guard let uid = env.auth.uid else {
            isCheckingOnboarding = false
            return
        }
        isCheckingOnboarding = true
        let profile = try? await env.db.getUser(uid: uid)
        await MainActor.run {
            onboardingComplete = profile?.onboardingComplete ?? false
            if onboardingComplete {
                Task { await PushNotificationService.shared.activateForAuthenticatedUser() }
            }
            if AppConstants.isUITesting {
                greetingDone = true
                showGreeting = false
            } else if onboardingComplete && !greetingDone {
                showGreeting = true
            }
            isCheckingOnboarding = false
        }
    }

    private func resetState() {
        showGreeting = false
        greetingDone = false
        onboardingComplete = false
        isCheckingOnboarding = true
    }
}

#if DEBUG
private struct CardDesignCatalogView: View {
    @EnvironmentObject private var theme: ThemeManager
    private let design: ProfileCardDesign
    private let showsSkills: Bool

    init() {
        let rawValue = ProcessInfo.processInfo.environment["UNISHARE_UI_CARD_DESIGN"] ?? "classic"
        design = ProfileCardDesign(rawValue: rawValue) ?? .classic
        showsSkills = ProcessInfo.processInfo.environment["UNISHARE_UI_CARD_FACE"] == "skills"
    }

    private var card: ProfileCard {
        let lastOfUs = GameTag(
            name: "The Last of Us",
            coverUrl: "https://media.rawg.io/media/games/a5a/a5a7fb8d9cb8063a8b42ee002b410db6.jpg"
        )
        let counterStrike = GameTag(
            name: "Counter-Strike 2",
            coverUrl: "https://media.rawg.io/media/games/ec4/ec4b02bdb3eb5c6212992c19bc05697e.jpg"
        )
        let cyberpunk = GameTag(
            name: "Cyberpunk 2077",
            coverUrl: "https://media.rawg.io/media/games/26d/26d4437715bee60138dab4a7c8c59c92.jpg"
        )
        let zelda = GameTag(
            name: "The Legend of Zelda",
            coverUrl: "https://media.rawg.io/media/games/f87/f87de0e93f02007fd044e4bf04d453d8.jpg"
        )
        let fortnite = GameTag(
            name: "Fortnite",
            coverUrl: "https://media.rawg.io/media/games/dcb/dcbb67f371a9a28ea38ffd73ee0f53f3.jpg"
        )
        let marioKart = GameTag(
            name: "Mario Kart 8 Deluxe",
            coverUrl: "https://media.rawg.io/media/games/6f8/6f846e941c78cfbabe53cd67e55ced83.jpg"
        )
        let minecraft = GameTag(
            name: "Minecraft",
            coverUrl: "https://media.rawg.io/media/games/b4e/b4e4c73d5aa4ec66bbf75375c4847a2b.jpg"
        )
        return ProfileCard(
            username: "Egor Player",
            platforms: [.playstation, .steam, .nintendo],
            tags: [lastOfUs],
            wantedGames: ["Fortnite", "Mario Kart", "Minecraft"],
            wantedGameTags: [fortnite, marioKart, minecraft],
            platformGames: [
                Platform.playstation.rawValue: ["The Last of Us"],
                Platform.steam.rawValue: ["Counter-Strike 2", "Cyberpunk 2077"],
                Platform.nintendo.rawValue: ["The Legend of Zelda"]
            ],
            platformGameTags: [
                Platform.playstation.rawValue: [lastOfUs],
                Platform.steam.rawValue: [counterStrike, cyberpunk],
                Platform.nintendo.rawValue: [zelda]
            ],
            userId: "ui-catalog-card",
            skills: ["Coaching", "Speedrunning", "Streaming", "Video Editing", "Tournaments"],
            skillsDescription: "I help players improve mechanics, strategy and competitive confidence.",
            status: "Collector",
            rating: 4.9,
            cardDesign: design,
            matchingOwnedGames: [GameNameValidator.normalized("Fortnite")]
        )
    }

    var body: some View {
        ZStack {
            BrandBackground()
            VStack(spacing: 12) {
                Text(design.localizedName)
                    .font(.system(size: 24, weight: .black, design: .rounded))
                    .foregroundStyle(theme.effectiveTextColor)
                if showsSkills {
                    SkillCardsOverlay(cards: [card], onSwipeRight: { _ in }, onSwipeLeft: { _ in })
                        .padding(.horizontal, 16)
                } else {
                    FeedCardsOverlay(cards: [card], onSwipeRight: { _ in }, onSwipeLeft: { _ in })
                        .padding(.horizontal, 16)
                }
            }
            .padding(.top, 28)
        }
    }
}

private struct StoryCatalogView: View {
    private let stories: [CommunityStory] = {
        let slides = [
            CommunityStorySlide(
                title: "Connect safely",
                subtitle: "Keep passwords outside the chat",
                body: "Use UniShare to discover players, check their public profile and never send payment details or security codes.",
                imageUrl: nil,
                symbol: "shield.checkered"
            ),
            CommunityStorySlide(
                title: "Check every detail",
                subtitle: "A minute now saves an account later",
                body: "Confirm the platform, game edition and play preferences before starting a conversation.",
                imageUrl: nil,
                symbol: "checkmark.seal.fill"
            )
        ]
        return [CommunityStory(
            id: "ui-catalog-story",
            title: "Safe connections",
            subtitle: "Two quick checks",
            body: slides[0].body,
            imageUrl: nil,
            symbol: "shield.checkered",
            accentHex: "#6046E8",
            ctaTitle: nil,
            ctaUrl: nil,
            publishedAt: .now,
            slides: slides,
            isSeen: false
        )]
    }()

    var body: some View {
        CommunityStoryViewer(stories: stories, initialStoryID: stories[0].id)
    }
}

private struct AirShareDecisionCatalogView: View {
    @State private var outcome = "pending"

    private let lastOfUs = GameTag(
        name: "The Last of Us",
        coverUrl: "https://media.rawg.io/media/games/a5a/a5a7fb8d9cb8063a8b42ee002b410db6.jpg"
    )

    private var card: ProfileCard { ProfileCard(
        username: "Nearby Player",
        platforms: [.playstation, .steam, .nintendo],
        tags: [lastOfUs],
        wantedGames: ["Fortnite", "Mario Kart", "Minecraft"],
        wantedGameTags: [GameTag(name: "Fortnite"), GameTag(name: "Mario Kart"), GameTag(name: "Minecraft")],
        platformGames: [
            Platform.playstation.rawValue: ["The Last of Us"],
            Platform.steam.rawValue: ["Counter-Strike 2", "Cyberpunk 2077"],
            Platform.nintendo.rawValue: ["The Legend of Zelda"]
        ],
        platformGameTags: [
            Platform.playstation.rawValue: [lastOfUs],
            Platform.steam.rawValue: [GameTag(name: "Counter-Strike 2"), GameTag(name: "Cyberpunk 2077")],
            Platform.nintendo.rawValue: [GameTag(name: "The Legend of Zelda")]
        ],
        userId: "airshare-catalog-card",
        status: "Collector",
        rating: 4.9,
        matchingOwnedGames: [GameNameValidator.normalized("Fortnite")]
    ) }

    var body: some View {
        ZStack(alignment: .bottom) {
            AirShareDecisionSheet(
                card: card,
                isIncomingRequest: true,
                onApprove: { outcome = "accepted" },
                onReject: { outcome = "declined" }
            )

            Text(outcome)
                .accessibilityIdentifier("airshare.card.outcome")
                .opacity(outcome == "pending" ? 0 : 1)
        }
    }
}
#endif
