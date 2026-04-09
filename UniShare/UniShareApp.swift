import SwiftUI
import FirebaseCore

@main
struct UniShareApp: App {
    @StateObject private var env = AppEnvironment()
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var localization = LocalizationManager.shared

    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(env)
                .environmentObject(theme)
                .environmentObject(localization)
                .preferredColorScheme(theme.effectiveColorScheme)
                .onOpenURL { url in
                    TabBarState.shared.handleDeepLink(url)
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                    Task {
                        await env.auth.updateOnlineStatus(isOnline: false, firestoreService: env.firestore)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                    Task {
                        await env.auth.updateOnlineStatus(isOnline: true, firestoreService: env.firestore)
                    }
                }
        }
    }
}
