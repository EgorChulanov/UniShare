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

            GeometryReader { geometry in
                let compact = geometry.size.height < 800 || !vm.isLoginMode || focusedField != nil
                let horizontalPadding: CGFloat = compact ? 16 : 24
                let contentWidth = min(max(geometry.size.width - horizontalPadding * 2, 1), 440)

                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: compact ? 12 : 28) {
                            Spacer(minLength: compact ? 6 : 46)
                            brand(compact: compact)
                                .id("auth.top")
                            form(compact: compact)
                            Spacer(minLength: compact ? 10 : 28)
                        }
                        .frame(width: contentWidth)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: geometry.size.height)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .scrollIndicators(.hidden)
                    .onChange(of: focusedField) { field in
                        guard let field else { return }
                        withAnimation(.easeOut(duration: 0.24)) {
                            proxy.scrollTo(field, anchor: .center)
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("common.done".localized) { focusedField = nil }
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.1)) { showGlow = true }
            withAnimation(.spring(response: 0.7, dampingFraction: 0.78).delay(0.08)) {
                showContent = true
            }
        }
    }

    private var background: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [theme.effectiveBackground, theme.effectiveTertiary.opacity(0.28)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Circle()
                    .fill(RadialGradient(
                        colors: [theme.effectivePrimary.opacity(0.42), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: min(geometry.size.width * 0.65, 220)
                    ))
                    .frame(width: min(geometry.size.width * 1.15, 440))
                    .offset(x: -geometry.size.width * 0.22, y: -geometry.size.height * 0.32)
                    .blur(radius: 18)
                    .opacity(showGlow ? 1 : 0)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
        .ignoresSafeArea()
    }

    private func brand(compact: Bool) -> some View {
        VStack(spacing: compact ? 7 : 12) {
            Image("UniShareLogo")
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 62 : 88, height: compact ? 62 : 88)
                .shadow(color: theme.effectivePrimary.opacity(0.38), radius: 18, y: 8)

            Text("app.name".localized)
                .font(.system(size: compact ? 25 : 34, weight: .bold))
                .foregroundColor(theme.effectiveTextColor)

            Text("auth.subtitle".localized)
                .font(.system(size: compact ? 13 : 15))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
        }
        .scaleEffect(showContent ? 1 : 0.86)
        .opacity(showContent ? 1 : 0)
    }

    private func form(compact: Bool) -> some View {
        VStack(spacing: compact ? 10 : 14) {
            authField(
                icon: "envelope",
                placeholder: "auth.email.placeholder".localized,
                text: $vm.email,
                field: .email,
                contentType: .emailAddress,
                isSecure: false,
                compact: compact,
                accessibilityIdentifier: "auth.email"
            )

            authField(
                icon: "lock",
                placeholder: "auth.password.placeholder".localized,
                text: $vm.password,
                field: .password,
                contentType: vm.isLoginMode ? .password : .newPassword,
                isSecure: true,
                compact: compact,
                accessibilityIdentifier: "auth.password"
            )

            if !vm.isLoginMode {
                authField(
                    icon: "checkmark.shield",
                    placeholder: "auth.password.confirm".localized,
                    text: $vm.confirmation,
                    field: .confirmation,
                    contentType: .password,
                    isSecure: true,
                    compact: compact,
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

            if !vm.isLoginMode {
                registrationConsent(compact: compact)
            }

            Button {
                performSubmit()
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
                .frame(height: compact ? 48 : 54)
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
            .frame(height: compact ? 48 : 54)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .disabled(vm.isLoading)
            .accessibilityIdentifier("auth.apple")

            Text("auth.apple.consent".localized)
                .font(.caption2)
                .foregroundStyle(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if compact {
                legalLinks(axis: .vertical)
            } else {
                ViewThatFits(in: .horizontal) {
                    legalLinks(axis: .horizontal)
                    legalLinks(axis: .vertical)
                }
            }

            Button {
                focusedField = nil
                withAnimation(.easeInOut(duration: 0.28)) { vm.toggleMode() }
            } label: {
                Text(vm.isLoginMode ? "auth.switch.register".localized : "auth.switch.login".localized)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.effectivePrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("auth.switchMode")

        }
        .padding(compact ? 14 : 18)
        .glass(cornerRadius: compact ? 20 : 24)
        .offset(y: showContent ? 0 : 28)
        .opacity(showContent ? 1 : 0)
    }

    private func registrationConsent(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                acceptsTerms.toggle()
            } label: {
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: acceptsTerms ? "checkmark.square.fill" : "square")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(acceptsTerms ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                        .frame(width: 22, height: 22)
                    Text("auth.consent".localized)
                        .font(.caption2)
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("auth.acceptTerms")

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { legalLinksContent }
                VStack(alignment: .leading, spacing: 4) { legalLinksContent }
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(theme.effectivePrimary)
            .padding(.leading, 31)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func legalLinks(axis: Axis) -> some View {
        if axis == .horizontal {
            HStack(spacing: 12) {
                legalLinksContent
            }
        } else {
            VStack(spacing: 6) {
                legalLinksContent
            }
        }
    }

    @ViewBuilder
    private var legalLinksContent: some View {
        Link("settings.terms".localized, destination: AppConstants.Legal.terms(language: localization.currentLanguage))
        Link("settings.privacy".localized, destination: AppConstants.Legal.privacyPolicy(language: localization.currentLanguage))
    }

    private func authField(
        icon: String,
        placeholder: String,
        text: Binding<String>,
        field: Field,
        contentType: UITextContentType,
        isSecure: Bool,
        compact: Bool,
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
        .frame(height: compact ? 48 : 54)
        .background(theme.effectiveCardColor.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .stroke(focusedField == field ? theme.effectivePrimary.opacity(0.8) : .white.opacity(0.08), lineWidth: 1)
        }
        .id(field)
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
            performSubmit()
        }
    }

    private func performSubmit() {
        focusedField = nil
        guard vm.isLoginMode || acceptsTerms else { return }
        HapticsManager.shared.impact(.medium)
        Task { await vm.submit() }
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
