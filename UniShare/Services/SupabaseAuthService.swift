import Foundation
import Supabase
import Combine

final class SupabaseAuthService: ObservableObject {
    @Published var isAuthenticated = false

    private let client = SupabaseManager.shared.client
    private var authListenerTask: Task<Void, Never>?

    var uid: String? {
        // Synchronously retrieve the cached session user id
        client.auth.currentUser?.id.uuidString
    }

    init() {
        // Seed initial state from the cached session synchronously
        self.isAuthenticated = client.auth.currentUser != nil

        // Watch auth state changes via the async stream
        authListenerTask = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in self.client.auth.authStateChanges {
                let authenticated: Bool
                switch event {
                case .signedIn, .tokenRefreshed, .userUpdated:
                    authenticated = session.map { !$0.isExpired } ?? false
                case .signedOut, .passwordRecovery, .userDeleted:
                    authenticated = false
                default:
                    authenticated = session.map { !$0.isExpired } ?? false
                }
                await MainActor.run { [weak self] in
                    self?.isAuthenticated = authenticated
                }
            }
        }
    }

    deinit {
        authListenerTask?.cancel()
    }

    // MARK: - Sign In

    func signIn(email: String, password: String) async throws {
        try await client.auth.signIn(email: email, password: password)
    }

    func signInWithApple(idToken: String, nonce: String) async throws {
        try await client.auth.signInWithIdToken(credentials: .init(
            provider: .apple,
            idToken: idToken,
            nonce: nonce
        ))
    }

    // MARK: - Sign Up

    func signUp(email: String, password: String) async throws -> SignUpResult {
        let response = try await client.auth.signUp(
            email: email,
            password: password,
            redirectTo: URL(string: "unishare://auth-callback")
        )
        return SignUpResult(
            userID: response.user.id.uuidString,
            requiresEmailConfirmation: response.session == nil
        )
    }

    // MARK: - Sign Out

    func signOut() async throws {
        await PushNotificationService.shared.unregisterCurrentToken()
        try await client.auth.signOut()
    }

    func deleteAccount() async throws {
        await PushNotificationService.shared.unregisterCurrentToken()
        struct DeletionResponse: Decodable { let deleted: Bool }
        let response: DeletionResponse = try await client.functions.invoke(
            "delete-account",
            options: FunctionInvokeOptions(body: ["confirmation": "DELETE"])
        )
        guard response.deleted else { throw AuthError.accountDeletionFailed }
        try? await client.auth.signOut()
    }

    func handleOpenURL(_ url: URL) -> Bool {
        guard url.scheme == "unishare", url.host == "auth-callback" else { return false }
        client.auth.handle(url)
        return true
    }

    // MARK: - Update online status

    func updateOnlineStatus(isOnline: Bool, firestoreService: SupabaseService) async {
        guard let uid else { return }
        try? await firestoreService.updateUser(uid: uid, data: [
            "is_online": AnyEncodable(isOnline),
            "last_seen": AnyEncodable(ISO8601DateFormatter().string(from: Date()))
        ])
    }

    // MARK: - Errors

    enum AuthError: LocalizedError {
        case noUserReturned
        case accountDeletionFailed

        var errorDescription: String? {
            switch self {
            case .noUserReturned: return "No user was returned after sign up"
            case .accountDeletionFailed: return "The account could not be deleted"
            }
        }
    }
}

struct SignUpResult {
    let userID: String
    let requiresEmailConfirmation: Bool
}
