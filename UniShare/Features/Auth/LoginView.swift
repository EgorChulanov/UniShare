import SwiftUI

struct LoginView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isLoginMode = true

    // Entry animation states
    @State private var showGlow = false
    @State private var showLogo = false
    @State private var showForm = false
    @State private var showButton = false

    var body: some View {
        ZStack {
            // Background with grain
            LinearGradient(
                colors: [theme.effectiveBackground, theme.effectiveTertiary.opacity(0.25)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            GrainOverlay(opacity: 0.14)

            // Ambient background glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [theme.effectivePrimary.opacity(0.35), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 220
                    )
                )
                .frame(width: 440, height: 440)
                .offset(x: -60, y: -200)
                .blur(radius: 20)
                .opacity(showGlow ? 1 : 0)
                .animation(.easeOut(duration: 1.2), value: showGlow)

            VStack(spacing: 0) {
                Spacer()

                // ── Logo section ─────────────────────────────────────
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(theme.effectivePrimary.opacity(0.18))
                            .frame(width: 80, height: 80)
                        Image(systemName: "gamecontroller.fill")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 36, height: 36)
                            .foregroundColor(theme.effectivePrimary)
                    }
                    .animatedGradientBorder(cornerRadius: 40, lineWidth: 2)
                    .scaleEffect(showLogo ? 1 : 0.3)
                    .opacity(showLogo ? 1 : 0)
                    .animation(.spring(response: 0.65, dampingFraction: 0.6), value: showLogo)

                    Text("app.name".localized)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(theme.effectiveTextColor)
                        .offset(y: showLogo ? 0 : 20)
                        .opacity(showLogo ? 1 : 0)
                        .animation(.easeOut(duration: 0.5).delay(0.15), value: showLogo)

                    Text("auth.subtitle".localized)
                        .font(.system(size: 15))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                        .offset(y: showLogo ? 0 : 16)
                        .opacity(showLogo ? 1 : 0)
                        .animation(.easeOut(duration: 0.5).delay(0.25), value: showLogo)
                }
                .padding(.bottom, 40)

                // ── Form ─────────────────────────────────────────────
                VStack(spacing: 16) {
                    HStack {
                        Image(systemName: "envelope")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                            .frame(width: 20)
                        TextField("auth.email.placeholder".localized, text: $email)
                            .autocapitalization(.none)
                            .keyboardType(.emailAddress)
                            .foregroundColor(theme.effectiveTextColor)
                            .accentColor(theme.effectivePrimary)
                    }
                    .padding()
                    .glass(cornerRadius: 14)
                    .offset(y: showForm ? 0 : 24)
                    .opacity(showForm ? 1 : 0)
                    .animation(.easeOut(duration: 0.45).delay(0.0), value: showForm)

                    HStack {
                        Image(systemName: "lock")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                            .frame(width: 20)
                        SecureField("auth.password.placeholder".localized, text: $password)
                            .foregroundColor(theme.effectiveTextColor)
                            .accentColor(theme.effectivePrimary)
                    }
                    .padding()
                    .glass(cornerRadius: 14)
                    .offset(y: showForm ? 0 : 24)
                    .opacity(showForm ? 1 : 0)
                    .animation(.easeOut(duration: 0.45).delay(0.1), value: showForm)

                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(theme.effectivePrimary)
                            .multilineTextAlignment(.center)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // CTA button
                    Button {
                        HapticsManager.shared.impact(.medium)
                        Task { await submit() }
                    } label: {
                        ZStack {
                            if isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text(isLoginMode ? "auth.login.button".localized : "auth.register.button".localized)
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(
                            LinearGradient(
                                colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(14)
                    }
                    .disabled(isLoading || email.isEmpty || password.isEmpty)
                    .scaleEffect(showButton ? 1 : 0.9)
                    .opacity(showButton ? 1 : 0)
                    .animation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.2), value: showButton)

                    Button {
                        withAnimation { isLoginMode.toggle(); errorMessage = nil }
                    } label: {
                        Text(isLoginMode ? "auth.switch.register".localized : "auth.switch.login".localized)
                            .font(.system(size: 14))
                            .foregroundColor(theme.effectivePrimary)
                    }
                    .opacity(showButton ? 1 : 0)
                    .animation(.easeOut(duration: 0.4).delay(0.3), value: showButton)
                }
                .padding(.horizontal, 24)

                Spacer()
                Spacer()
            }
        }
        .onAppear { runEntryAnimation() }
    }

    private func runEntryAnimation() {
        showGlow = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { showLogo = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { showForm = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) { showButton = true }
    }

    private func submit() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            if isLoginMode {
                try await env.auth.signIn(email: email, password: password)
            } else {
                let uid = try await env.auth.signUp(email: email, password: password)
                let profile = UserProfile(
                    uid: uid,
                    username: email.components(separatedBy: "@").first ?? "user"
                )
                try await env.db.createUser(profile)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
