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
            for await (event, session) in await client.auth.authStateChanges {
                let authenticated: Bool
                switch event {
                case .signedIn, .tokenRefreshed, .userUpdated:
                    authenticated = session != nil
                case .signedOut, .passwordRecovery, .userDeleted:
                    authenticated = false
                default:
                    authenticated = session != nil
                }
                await MainActor.run {
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

    // MARK: - Sign Up

    func signUp(email: String, password: String) async throws -> String {
        let response = try await client.auth.signUp(email: email, password: password)
        guard let user = response.user else {
            throw AuthError.noUserReturned
        }
        return user.id.uuidString
    }

    // MARK: - Sign Out

    func signOut() throws {
        Task {
            try await client.auth.signOut()
        }
    }

    // MARK: - Update online status

    func updateOnlineStatus(isOnline: Bool, firestoreService: SupabaseService) async {
        guard let uid else { return }
        try? await firestoreService.updateUser(uid: uid, data: [
            "is_online": isOnline,
            "last_seen": ISO8601DateFormatter().string(from: Date())
        ])
    }

    // MARK: - Errors

    enum AuthError: LocalizedError {
        case noUserReturned

        var errorDescription: String? {
            switch self {
            case .noUserReturned: return "No user was returned after sign up"
            }
        }
    }
}
