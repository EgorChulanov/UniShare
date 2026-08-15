import SwiftUI

struct ContentView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @State private var showGreeting = false
    @State private var greetingDone = false
    @State private var onboardingComplete = false
    @State private var isCheckingOnboarding = true
    @State private var onboardingError: String?

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            if env.auth.isAuthenticated {
                if isCheckingOnboarding {
                    // Brief loading while we check onboarding status
                    ProgressView()
                        .tint(theme.effectivePrimary)
                } else if onboardingError != nil {
                    onboardingLoadFailure
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
        onboardingError = nil

        do {
            let profile = try await loadProfile(uid: uid)
            await applyOnboardingResult(profile)
        } catch {
            await MainActor.run {
                onboardingError = error.localizedDescription
                isCheckingOnboarding = false
            }
        }
    }

    private func loadProfile(uid: String) async throws -> UserProfile? {
        var lastError: Error?
        for delay in [UInt64(0), 400_000_000, 1_000_000_000] {
            if delay > 0 { try await Task.sleep(nanoseconds: delay) }
            do {
                return try await env.db.getUser(uid: uid)
            } catch {
                lastError = error
            }
        }
        throw lastError ?? URLError(.unknown)
    }

    @MainActor
    private func applyOnboardingResult(_ profile: UserProfile?) {
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

    private var onboardingLoadFailure: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(theme.effectivePrimary)
            Text("common.network_error".localized)
                .font(.headline)
                .foregroundStyle(theme.effectiveTextColor)
                .multilineTextAlignment(.center)
            Button("common.retry".localized) {
                Task { await checkOnboardingStatus() }
            }
            .buttonStyle(.borderedProminent)
            .tint(theme.effectivePrimary)
        }
        .padding(24)
        .accessibilityIdentifier("onboarding.load.error")
    }

    private func resetState() {
        showGreeting = false
        greetingDone = false
        onboardingComplete = false
        onboardingError = nil
        isCheckingOnboarding = true
    }
}
