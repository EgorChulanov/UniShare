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
                        showGreeting = true
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
        .animation(.easeInOut(duration: 0.3), value: env.auth.isAuthenticated)
        .task {
            await checkOnboardingStatus()
        }
        .onChange(of: env.auth.isAuthenticated) { isAuth in
            if isAuth {
                Task { await checkOnboardingStatus() }
            } else {
                resetState()
            }
        }
    }

    private func checkOnboardingStatus() async {
        guard let uid = env.auth.uid else {
            isCheckingOnboarding = false
            return
        }
        isCheckingOnboarding = true
        let profile = try? await env.firestore.getUser(uid: uid)
        await MainActor.run {
            onboardingComplete = profile?.onboardingComplete ?? false
            if onboardingComplete && !greetingDone {
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
