import SwiftUI

struct TabBarView: View {
    @StateObject private var tabState = TabBarState.shared
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager
    @EnvironmentObject var env: AppEnvironment

    @State private var aiTapCount = 0
    @State private var showAirShare = false

    var body: some View {
        ZStack {
        TabView(selection: $tabState.selectedTab) {
            FeedView()
                .tabItem {
                    Label("tab.feed".localized, systemImage: "star.fill")
                }
                .tag(AppTab.feed)

            ChatsView()
                .tabItem {
                    Label("tab.chats".localized, systemImage: "message.fill")
                }
                .tag(AppTab.chats)

            AIView()
                .tabItem {
                    Label("tab.ai".localized, systemImage: "sparkles")
                }
                .tag(AppTab.ai)

            ProfileView()
                .tabItem {
                    Label("tab.profile".localized, systemImage: "person.crop.circle.fill")
                }
                .tag(AppTab.profile)
        }
        .accentColor(theme.effectivePrimary)
        .onAppear {
            theme.applyTabBarAppearance()
            ShakeDetectionService.shared.start()
        }
        .onChange(of: theme.currentCardColor) { _ in
            theme.applyTabBarAppearance()
        }
        .onChange(of: tabState.selectedTab) { tab in
            if tab == .ai {
                aiTapCount += 1
                if aiTapCount >= AppConstants.AI.eastEggTapCount {
                    aiTapCount = 0
                    if let uid = env.auth.uid {
                        DynamicIslandService.shared.startEasterEgg(username: uid)
                    }
                }
            } else {
                aiTapCount = 0
            }
        }
        .sheet(isPresented: $tabState.showAirShare) {
            AirShareView()
        }

        // Global grain texture over all tabs
        GrainOverlay(opacity: 0.045)
        } // ZStack
    }
}
