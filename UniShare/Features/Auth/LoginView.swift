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

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [theme.effectiveBackground, theme.effectiveTertiary.opacity(0.3)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(theme.effectivePrimary.opacity(0.2))
                            .frame(width: 80, height: 80)
                        Image(systemName: "gamecontroller.fill")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 36, height: 36)
                            .foregroundColor(theme.effectivePrimary)
                    }
                    .animatedGradientBorder(cornerRadius: 40, lineWidth: 2)

                    Text("app.name".localized)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(theme.effectiveTextColor)

                    Text("auth.subtitle".localized)
                        .font(.system(size: 15))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
                .padding(.bottom, 40)

                // Form
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

                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(theme.effectivePrimary)
                            .multilineTextAlignment(.center)
                    }

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

                    Button {
                        withAnimation { isLoginMode.toggle(); errorMessage = nil }
                    } label: {
                        Text(isLoginMode ? "auth.switch.register".localized : "auth.switch.login".localized)
                            .font(.system(size: 14))
                            .foregroundColor(theme.effectivePrimary)
                    }
                }
                .padding(.horizontal, 24)

                Spacer()
                Spacer()
            }
        }
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
                try await env.firestore.createUser(profile)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
