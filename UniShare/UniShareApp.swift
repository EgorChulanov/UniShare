import SwiftUI

@main
struct UniShareApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var env = AppEnvironment.shared
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var localization = LocalizationManager.shared

    init() {
        ManropeFontSwizzle.apply()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(env)
                .environmentObject(theme)
                .environmentObject(localization)
                .preferredColorScheme(theme.effectiveColorScheme)
                .onOpenURL { url in
                    if !env.auth.handleOpenURL(url) {
                        TabBarState.shared.handleDeepLink(url)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                    Task {
                        await env.auth.updateOnlineStatus(isOnline: false, firestoreService: env.db)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                    Task {
                        await env.auth.updateOnlineStatus(isOnline: true, firestoreService: env.db)
                    }
                }
        }
    }
}
