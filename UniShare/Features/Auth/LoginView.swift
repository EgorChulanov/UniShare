import SwiftUI
import UIKit
import AuthenticationServices
import CryptoKit
import Security

struct LoginView: View {
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var localization: LocalizationManager

    @StateObject private var vm: AuthViewModel
    @FocusState private var focusedField: Field?
    @State private var showGlow = false
    @State private var showContent = false
    @State private var acceptsTerms = false
    @State private var appleNonce: String?

    init() {
        _vm = StateObject(wrappedValue: AuthViewModel(auth: AppEnvironment.shared.auth))
    }

    var body: some View {
        ZStack {
            background

            ScrollView {
                VStack(spacing: 28) {
                    Spacer(minLength: 54)
                    brand
                    form
                    Spacer(minLength: 28)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.1)) { showGlow = true }
            withAnimation(.spring(response: 0.7, dampingFraction: 0.78).delay(0.08)) {
                showContent = true
            }
        }
    }

    private var background: some View {
        ZStack {
            LinearGradient(
                colors: [theme.effectiveBackground, theme.effectiveTertiary.opacity(0.28)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(RadialGradient(
                    colors: [theme.effectivePrimary.opacity(0.42), .clear],
                    center: .center,
                    startRadius: 0,
                    endRadius: 240
                ))
                .frame(width: 480, height: 480)
                .offset(x: -90, y: -270)
                .blur(radius: 18)
                .opacity(showGlow ? 1 : 0)

        }
    }

    private var brand: some View {
        VStack(spacing: 12) {
            Image(systemName: "gamecontroller.fill")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(theme.effectivePrimary)
                .frame(width: 82, height: 82)
                .glass(cornerRadius: 28)
                .animatedGradientBorder(cornerRadius: 28, lineWidth: 2)

            Text("app.name".localized)
                .font(.system(size: 34, weight: .bold))
                .foregroundColor(theme.effectiveTextColor)

            Text("auth.subtitle".localized)
                .font(.system(size: 15))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
        }
        .scaleEffect(showContent ? 1 : 0.86)
        .opacity(showContent ? 1 : 0)
    }

    private var form: some View {
        VStack(spacing: 14) {
            authField(
                icon: "envelope",
                placeholder: "auth.email.placeholder".localized,
                text: $vm.email,
                field: .email,
                contentType: .emailAddress,
                isSecure: false,
                accessibilityIdentifier: "auth.email"
            )

            authField(
                icon: "lock",
                placeholder: "auth.password.placeholder".localized,
                text: $vm.password,
                field: .password,
                contentType: vm.isLoginMode ? .password : .newPassword,
                isSecure: true,
                accessibilityIdentifier: "auth.password"
            )

            if !vm.isLoginMode {
                authField(
                    icon: "checkmark.shield",
                    placeholder: "auth.password.confirm".localized,
                    text: $vm.confirmation,
                    field: .confirmation,
                    contentType: .newPassword,
                    isSecure: true,
                    accessibilityIdentifier: "auth.confirmation"
                )
                .transition(.move(edge: .top).combined(with: .opacity))

                Text("auth.password.hint".localized)
                    .font(.caption)
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let message = vm.errorMessage {
                statusLabel(message, systemImage: "exclamationmark.triangle.fill", color: theme.effectivePrimary)
            }

            if let message = vm.successMessage {
                statusLabel(message, systemImage: "envelope.badge.fill", color: .green)
            }

            Button {
                focusedField = nil
                HapticsManager.shared.impact(.medium)
                Task { await vm.submit() }
            } label: {
                Group {
                    if vm.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text(vm.isLoginMode ? "auth.login.button".localized : "auth.register.button".localized)
                            .font(.system(size: 16, weight: .semibold))
                    }
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(
                    LinearGradient(
                        colors: [theme.effectivePrimary, theme.effectiveTertiary],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .disabled(!vm.canSubmit || (!vm.isLoginMode && !acceptsTerms))
            .opacity(vm.canSubmit && (vm.isLoginMode || acceptsTerms) ? 1 : 0.48)
            .accessibilityIdentifier("auth.submit")

            HStack(spacing: 12) {
                Rectangle().fill(theme.effectiveSecondaryTextColor.opacity(0.25)).frame(height: 1)
                Text("auth.or".localized)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
                Rectangle().fill(theme.effectiveSecondaryTextColor.opacity(0.25)).frame(height: 1)
            }

            SignInWithAppleButton(.continue) { request in
                let nonce = AppleSignInNonce.make()
                appleNonce = nonce
                request.requestedScopes = [.email, .fullName]
                request.nonce = AppleSignInNonce.sha256(nonce)
            } onCompletion: { result in
                handleAppleCompletion(result)
            }
            .signInWithAppleButtonStyle(theme.effectiveColorScheme == .dark ? .white : .black)
            .frame(height: 54)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .disabled(vm.isLoading)
            .accessibilityIdentifier("auth.apple")

            Text("auth.apple.consent".localized)
                .font(.caption2)
                .foregroundStyle(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)

            HStack(spacing: 12) {
                Link("settings.terms".localized, destination: AppConstants.Legal.terms)
                Link("settings.privacy".localized, destination: AppConstants.Legal.privacyPolicy)
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(theme.effectivePrimary)

            Button {
                withAnimation(.easeInOut(duration: 0.28)) { vm.toggleMode() }
            } label: {
                Text(vm.isLoginMode ? "auth.switch.register".localized : "auth.switch.login".localized)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.effectivePrimary)
            }
            .accessibilityIdentifier("auth.switchMode")

            if !vm.isLoginMode {
                HStack(alignment: .top, spacing: 9) {
                    Button {
                        acceptsTerms.toggle()
                    } label: {
                        Image(systemName: acceptsTerms ? "checkmark.square.fill" : "square")
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundStyle(acceptsTerms ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                    }
                    .accessibilityIdentifier("auth.acceptTerms")

                    VStack(alignment: .leading, spacing: 4) {
                        Text("auth.consent".localized)
                            .font(.caption2)
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                        HStack(spacing: 10) {
                            Link("settings.terms".localized, destination: AppConstants.Legal.terms)
                            Link("settings.privacy".localized, destination: AppConstants.Legal.privacyPolicy)
                        }
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(theme.effectivePrimary)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(18)
        .glass(cornerRadius: 24)
        .offset(y: showContent ? 0 : 28)
        .opacity(showContent ? 1 : 0)
    }

    private func authField(
        icon: String,
        placeholder: String,
        text: Binding<String>,
        field: Field,
        contentType: UITextContentType,
        isSecure: Bool,
        accessibilityIdentifier: String
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .frame(width: 20)

            Group {
                if isSecure {
                    SecureField(placeholder, text: text)
                } else {
                    TextField(placeholder, text: text)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .textContentType(contentType)
            .focused($focusedField, equals: field)
            .foregroundColor(theme.effectiveTextColor)
            .submitLabel(field == .confirmation || (field == .password && vm.isLoginMode) ? .go : .next)
            .onSubmit { handleSubmit(from: field) }
            .accessibilityIdentifier(accessibilityIdentifier)
        }
        .padding(.horizontal, 15)
        .frame(height: 54)
        .background(theme.effectiveCardColor.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .stroke(focusedField == field ? theme.effectivePrimary.opacity(0.8) : .white.opacity(0.08), lineWidth: 1)
        }
    }

    private func statusLabel(_ message: String, systemImage: String, color: Color) -> some View {
        Label(message, systemImage: systemImage)
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    private func handleSubmit(from field: Field) {
        switch field {
        case .email:
            focusedField = .password
        case .password where !vm.isLoginMode:
            focusedField = .confirmation
        default:
            focusedField = nil
            Task { await vm.submit() }
        }
    }

    private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8),
                  let nonce = appleNonce else {
                vm.showError(AppleSignInError.invalidCredential)
                return
            }
            appleNonce = nil
            Task { await vm.signInWithApple(idToken: token, nonce: nonce) }
        case .failure(let error):
            appleNonce = nil
            if (error as? ASAuthorizationError)?.code != .canceled {
                vm.showError(error)
            }
        }
    }
}

private extension LoginView {
    enum Field: Hashable {
        case email
        case password
        case confirmation
    }
}

private enum AppleSignInError: LocalizedError {
    case invalidCredential

    var errorDescription: String? { "auth.apple.error".localized }
}

private enum AppleSignInNonce {
    static func make(length: Int = 32) -> String {
        precondition(length > 0)
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var randomBytes = [UInt8](repeating: 0, count: 16)
        while result.count < length {
            guard SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes) == errSecSuccess else {
                return UUID().uuidString.replacingOccurrences(of: "-", with: "")
            }
            for byte in randomBytes where result.count < length {
                if byte < characters.count {
                    result.append(characters[Int(byte)])
                }
            }
        }
        return result
    }

    static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
