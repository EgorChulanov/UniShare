import Foundation
import Combine

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isLoginMode = true

    private let auth: FirebaseAuthService
    private let firestore: FirestoreService

    init(auth: FirebaseAuthService, firestore: FirestoreService) {
        self.auth = auth
        self.firestore = firestore
    }

    func submit() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            if isLoginMode {
                try await auth.signIn(email: email, password: password)
            } else {
                let uid = try await auth.signUp(email: email, password: password)
                let profile = UserProfile(uid: uid, username: email.components(separatedBy: "@").first ?? "user")
                try await firestore.createUser(profile)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleMode() {
        isLoginMode.toggle()
        errorMessage = nil
    }
}
