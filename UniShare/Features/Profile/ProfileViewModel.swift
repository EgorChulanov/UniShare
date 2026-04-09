import Foundation
import UIKit
import Combine

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var profile: UserProfile?
    @Published var isEditing = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    // Edit state (mirrors profile fields)
    @Published var editUsername = ""
    @Published var editStatus = ""
    @Published var editGames: [GameTag] = []
    @Published var editWantedGames: [GameTag] = []
    @Published var editPlatforms: Set<Platform> = []
    @Published var editGamesByPlatform: [Platform: [GameTag]] = [:]
    @Published var editActiveGamePlatform: Platform?
    @Published var editSkills: [String] = []
    @Published var editSubscriptions: [LocalUserSubscription] = []
    @Published var editAvatar: UIImage?

    // Game search
    @Published var gameSearchQuery = ""
    @Published var gameSearchResults: [GameTag] = []
    @Published var isSearchingGames = false

    private let auth: FirebaseAuthService
    private let firestore: FirestoreService
    private let storage: StorageService
    private let rawg: RawgService
    private var searchTask: Task<Void, Never>?

    init(auth: FirebaseAuthService, firestore: FirestoreService, storage: StorageService, rawg: RawgService) {
        self.auth = auth
        self.firestore = firestore
        self.storage = storage
        self.rawg = rawg
    }

    func load() async {
        guard let uid = auth.uid else { return }
        isLoading = true
        defer { isLoading = false }
        profile = try? await firestore.getUser(uid: uid)
        if let p = profile {
            await AvatarCacheService.shared.loadUserAvatar(from: p.avatarUrl)
        }
    }

    func startEditing() {
        guard let p = profile else { return }
        editUsername = p.username
        editStatus = p.status ?? ""
        editGames = p.games.map { GameTag(name: $0) }
        editWantedGames = p.wantedGames.map { GameTag(name: $0) }
        let platforms = Set(p.platforms.compactMap { Platform(rawValue: $0) })
        editPlatforms = platforms
        // Restore per-platform games
        editGamesByPlatform = [:]
        for platform in platforms {
            let names = p.platformGames[platform.rawValue] ?? []
            if !names.isEmpty {
                editGamesByPlatform[platform] = names.map { GameTag(name: $0) }
            }
        }
        editActiveGamePlatform = platforms.first
        editSkills = p.skills
        editSubscriptions = p.subscriptions
        editAvatar = nil
        isEditing = true
    }

    func cancelEditing() {
        isEditing = false
    }

    func saveChanges() async {
        guard let uid = auth.uid, var p = profile else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            if let image = editAvatar {
                let url = try await storage.uploadAvatar(image, uid: uid)
                p.avatarUrl = url
                await AvatarCacheService.shared.loadUserAvatar(from: url)
            }

            p.username = editUsername
            p.status = editStatus.isEmpty ? nil : editStatus
            p.platforms = editPlatforms.map { $0.rawValue }
            p.skills = editSkills
            p.subscriptions = editSubscriptions
            // Build platformGames and flat games list from editGamesByPlatform
            var newPlatformGames: [String: [String]] = [:]
            var allGames: [String] = []
            for platform in editPlatforms {
                let names = (editGamesByPlatform[platform] ?? []).map { $0.name }
                newPlatformGames[platform.rawValue] = names
                allGames.append(contentsOf: names)
            }
            p.platformGames = newPlatformGames
            p.games = Array(Set(allGames))
            p.wantedGames = editWantedGames.map { $0.name }

            try await firestore.updateUser(uid: uid, data: p.firestoreData)
            profile = p
            isEditing = false

            // Update widgets
            let avatar = AvatarCacheService.shared.cachedAvatar
            WidgetDataService.shared.updateWidgetData(
                username: p.username,
                avatar: avatar,
                unreadCount: 0,
                likesCount: 0
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleGame(_ tag: GameTag, for platform: Platform) {
        var list = editGamesByPlatform[platform] ?? []
        if let idx = list.firstIndex(where: { $0.name == tag.name }) {
            list.remove(at: idx)
        } else {
            list.append(tag)
        }
        editGamesByPlatform[platform] = list
    }

    func searchGames(_ query: String) {
        searchTask?.cancel()
        guard !query.isEmpty else { gameSearchResults = []; return }
        isSearchingGames = true
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let results = await rawg.searchGames(query).map { rawg.gameToTag($0) }
            await MainActor.run {
                gameSearchResults = results
                isSearchingGames = false
            }
        }
    }

    func signOut() throws {
        try auth.signOut()
    }
}
