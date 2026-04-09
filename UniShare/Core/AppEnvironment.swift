import Foundation

// Dependency injection container passed via @EnvironmentObject
final class AppEnvironment: ObservableObject {
    let auth: FirebaseAuthService
    let firestore: FirestoreService
    let storage: StorageService
    let chatGPT: ChatGPTService
    let rawg: RawgService

    init() {
        self.auth = FirebaseAuthService()
        self.firestore = FirestoreService()
        self.storage = StorageService()
        self.chatGPT = ChatGPTService()
        self.rawg = RawgService()
    }
}
