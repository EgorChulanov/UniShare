import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var confirmation = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?
    @Published var isLoginMode = true

    private let auth: SupabaseAuthService

    init(auth: SupabaseAuthService) {
        self.auth = auth
    }

    var canSubmit: Bool {
        let passwordIsValid = isLoginMode ? password.count >= 8 : PasswordPolicy.isValid(password)
        return isEmailValid && passwordIsValid && (isLoginMode || password == confirmation) && !isLoading
    }

    private var isEmailValid: Bool {
        let parts = email.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "@")
        return parts.count == 2 && parts[1].contains(".")
    }

    func submit() async {
        guard canSubmit else {
            errorMessage = validationMessage
            return
        }
        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }

        do {
            let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if isLoginMode {
                try await auth.signIn(email: normalizedEmail, password: password)
            } else {
                let result = try await auth.signUp(email: normalizedEmail, password: password)
                if result.requiresEmailConfirmation {
                    successMessage = "auth.confirmation.sent".localized
                    password = ""
                    confirmation = ""
                }
            }
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    func signInWithApple(idToken: String, nonce: String) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }
        do {
            try await auth.signInWithApple(idToken: idToken, nonce: nonce)
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    func showError(_ error: Error) {
        errorMessage = friendlyMessage(for: error)
    }

    func toggleMode() {
        isLoginMode.toggle()
        errorMessage = nil
        successMessage = nil
        confirmation = ""
    }

    private var validationMessage: String {
        if !isEmailValid { return "auth.error.email".localized }
        if isLoginMode && password.count < 8 { return "auth.error.password.length".localized }
        if !isLoginMode && !PasswordPolicy.isValid(password) { return "auth.error.password.strength".localized }
        if !isLoginMode && password != confirmation { return "auth.error.password.match".localized }
        return "auth.error.invalid".localized
    }

    private func friendlyMessage(for error: Error) -> String {
        let message = error.localizedDescription.lowercased()
        if message.contains("invalid login") || message.contains("invalid credentials") {
            return "auth.error.invalid".localized
        }
        if message.contains("already registered") || message.contains("already exists") {
            return "auth.error.registered".localized
        }
        if message.contains("email not confirmed") {
            return "auth.error.unconfirmed".localized
        }
        if message.contains("network") || message.contains("offline") {
            return "auth.error.network".localized
        }
        return error.localizedDescription
    }
}
