import Foundation
import Combine

// Dependency injection container passed via @EnvironmentObject
final class AppEnvironment: ObservableObject {
    let auth: FirebaseAuthService
    let firestore: FirestoreService
    let storage: StorageService
    let chatGPT: ChatGPTService
    let rawg: RawgService

    private var cancellables = Set<AnyCancellable>()

    init() {
        self.auth = FirebaseAuthService()
        self.firestore = FirestoreService()
        self.storage = StorageService()
        self.chatGPT = ChatGPTService()
        self.rawg = RawgService()

        // Forward changes from nested ObservableObjects so SwiftUI re-renders ContentView
        auth.objectWillChange
            .sink { [weak self] in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }
}
