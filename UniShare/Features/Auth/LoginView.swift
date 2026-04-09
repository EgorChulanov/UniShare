import SwiftUI

struct LoginView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: AuthViewModel

    init() {
        // We can't access @EnvironmentObject in init, so we use a placeholder
        // The actual env is set via onAppear
        _vm = StateObject(wrappedValue: AuthViewModel(
            auth: FirebaseAuthService(),
            firestore: FirestoreService()
        ))
    }

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [theme.effectiveBackground, theme.effectiveTertiary.opacity(0.3)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo area
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
                    // Email
                    HStack {
                        Image(systemName: "envelope")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                            .frame(width: 20)
                        TextField("auth.email.placeholder".localized, text: $vm.email)
                            .autocapitalization(.none)
                            .keyboardType(.emailAddress)
                            .foregroundColor(theme.effectiveTextColor)
                            .accentColor(theme.effectivePrimary)
                    }
                    .padding()
                    .glass(cornerRadius: 14)

                    // Password
                    HStack {
                        Image(systemName: "lock")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                            .frame(width: 20)
                        SecureField("auth.password.placeholder".localized, text: $vm.password)
                            .foregroundColor(theme.effectiveTextColor)
                            .accentColor(theme.effectivePrimary)
                    }
                    .padding()
                    .glass(cornerRadius: 14)

                    // Error
                    if let error = vm.errorMessage {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(theme.effectivePrimary)
                            .multilineTextAlignment(.center)
                    }

                    // Submit button
                    Button {
                        HapticsManager.shared.impact(.medium)
                        Task { await vm.submit() }
                    } label: {
                        ZStack {
                            if vm.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text(vm.isLoginMode ? "auth.login.button".localized : "auth.register.button".localized)
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
                    .disabled(vm.isLoading || vm.email.isEmpty || vm.password.isEmpty)

                    // Toggle mode
                    Button {
                        vm.toggleMode()
                    } label: {
                        Text(vm.isLoginMode ? "auth.switch.register".localized : "auth.switch.login".localized)
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
}
