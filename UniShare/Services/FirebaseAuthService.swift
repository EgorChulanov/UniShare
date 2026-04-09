import Foundation
import FirebaseAuth
import Combine

final class FirebaseAuthService: ObservableObject {
    @Published var currentUser: FirebaseAuth.User?
    @Published var isAuthenticated = false

    private var authListener: AuthStateDidChangeListenerHandle?

    init() {
        // Sync load so uid is available immediately (important for VMs created in View.init)
        self.currentUser = Auth.auth().currentUser
        self.isAuthenticated = Auth.auth().currentUser != nil
        authListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            DispatchQueue.main.async {
                self?.currentUser = user
                self?.isAuthenticated = user != nil
            }
        }
    }

    deinit {
        if let listener = authListener {
            Auth.auth().removeStateDidChangeListener(listener)
        }
    }

    var uid: String? { currentUser?.uid }

    // MARK: - Sign In

    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    // MARK: - Sign Up

    func signUp(email: String, password: String) async throws -> String {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        return result.user.uid
    }

    // MARK: - Sign Out

    func signOut() throws {
        try Auth.auth().signOut()
    }

    // MARK: - Update online status

    func updateOnlineStatus(isOnline: Bool, firestoreService: FirestoreService) async {
        guard let uid else { return }
        try? await firestoreService.updateUser(uid: uid, data: [
            "isOnline": isOnline,
            "lastSeen": Date()
        ])
    }
}
