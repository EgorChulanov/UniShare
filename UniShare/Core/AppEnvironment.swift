import Foundation
import Combine

final class AppEnvironment: ObservableObject {
    static let shared = AppEnvironment()

    let auth: SupabaseAuthService
    let db: SupabaseService
    let storage: SupabaseStorageService
    let rawg: RawgService

    private var cancellables = Set<AnyCancellable>()

    init() {
        self.auth = SupabaseAuthService()
        self.db = SupabaseService()
        self.storage = SupabaseStorageService()
        self.rawg = RawgService()

        auth.objectWillChange
            .sink { [weak self] in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }
}
