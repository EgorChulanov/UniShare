import Foundation
import UIKit
import Combine

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var profile: UserProfile?
    @Published var isEditing = false
    @Published var isLoading = false
    @Published var errorMessage: String?

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

    @Published var gameSearchQuery = ""
    @Published var gameSearchResults: [GameTag] = []
    @Published var isSearchingGames = false

    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private let storage: SupabaseStorageService
    private let rawg: RawgService
    private var searchTask: Task<Void, Never>?

    var canSaveChanges: Bool {
        ProfileInputValidator.username(editUsername) != nil
            && editStatus.count <= 180
            && !editPlatforms.isEmpty
            && !isLoading
    }

    init(auth: SupabaseAuthService, db: SupabaseService, storage: SupabaseStorageService, rawg: RawgService) {
        self.auth = auth
        self.db = db
        self.storage = storage
        self.rawg = rawg
    }

    func load() async {
        guard let uid = auth.uid else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            profile = try await db.getUser(uid: uid)
            if let profile {
                await AvatarCacheService.shared.loadUserAvatar(from: profile.avatarUrl)
            }
        } catch {
            errorMessage = error.localizedDescription
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

    func saveChanges() async -> Bool {
        guard let uid = auth.uid, var p = profile else { return false }
        guard let username = ProfileInputValidator.username(editUsername) else {
            errorMessage = "profile.error.username".localized
            return false
        }
        guard editStatus.count <= 180 else {
            errorMessage = "profile.error.status.length".localized
            return false
        }
        guard !editPlatforms.isEmpty else {
            errorMessage = "profile.error.platform.required".localized
            return false
        }
        isLoading = true
        defer { isLoading = false }

        do {
            if let image = editAvatar {
                let url = try await storage.uploadAvatar(image, uid: uid)
                p.avatarUrl = url
                await AvatarCacheService.shared.loadUserAvatar(from: url)
            }

            p.username = username
            let normalizedStatus = editStatus.trimmingCharacters(in: .whitespacesAndNewlines)
            p.status = normalizedStatus.isEmpty ? nil : normalizedStatus
            p.platforms = Platform.allCases.filter(editPlatforms.contains).map(\.rawValue)
            p.skills = editSkills
            p.subscriptions = uniqueSubscriptions(editSubscriptions)
            var newPlatformGames: [String: [String]] = [:]
            var allGames: [String] = []
            for platform in editPlatforms {
                let names = (editGamesByPlatform[platform] ?? []).map { $0.name }
                newPlatformGames[platform.rawValue] = names
                allGames.append(contentsOf: names)
            }
            p.platformGames = newPlatformGames
            p.games = GameNameValidator.uniqueNames(allGames)
            p.wantedGames = GameNameValidator.uniqueNames(editWantedGames.map { $0.name })

            let data: [String: AnyEncodable] = [
                "username": AnyEncodable(p.username),
                "status": AnyEncodable(p.status ?? ""),
                "avatar_url": AnyEncodable(p.avatarUrl ?? ""),
                "games": AnyEncodable(p.games),
                "wanted_games": AnyEncodable(p.wantedGames),
                "platforms": AnyEncodable(p.platforms),
                "platform_games": AnyEncodable(p.platformGames),
                "skills": AnyEncodable(p.skills),
                "subscriptions": AnyEncodable(p.subscriptions.map { subscriptionPayload($0) })
            ]
            try await db.updateUser(uid: uid, data: data)
            guard let persistedProfile = try await db.getUser(uid: uid) else {
                throw ProfileSaveError.profileNotReturned
            }
            profile = persistedProfile
            isEditing = false
            NotificationCenter.default.post(name: .uniShareProfileDidUpdate, object: nil)

            let avatar = AvatarCacheService.shared.cachedAvatar
            WidgetDataService.shared.updateWidgetData(
                username: persistedProfile.username,
                avatar: avatar,
                unreadCount: 0,
                likesCount: 0
            )
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func toggleGame(_ tag: GameTag, for platform: Platform) {
        var list = editGamesByPlatform[platform] ?? []
        let normalizedName = GameNameValidator.normalized(tag.name)
        if let idx = list.firstIndex(where: { GameNameValidator.normalized($0.name) == normalizedName }) {
            list.remove(at: idx)
        } else {
            list.append(tag)
        }
        editGamesByPlatform[platform] = list
    }

    func toggleSubscription(_ subscription: LocalUserSubscription) {
        let normalizedName = subscription.name.lowercased()
        if editSubscriptions.contains(where: { $0.name.lowercased() == normalizedName }) {
            editSubscriptions.removeAll { $0.name.lowercased() == normalizedName }
        } else {
            editSubscriptions.append(subscription)
        }
        editSubscriptions = uniqueSubscriptions(editSubscriptions)
    }

    func updateSubscription(_ subscription: LocalUserSubscription) {
        var subscription = subscription
        subscription.url = nil
        subscription.details = nil
        subscription.sharedSlots = nil
        editSubscriptions.removeAll { $0.name.caseInsensitiveCompare(subscription.name) == .orderedSame }
        editSubscriptions.append(subscription)
        editSubscriptions = uniqueSubscriptions(editSubscriptions)
    }

    func removeSubscription(named name: String) {
        editSubscriptions.removeAll { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    func searchGames(_ query: String) {
        searchTask?.cancel()
        guard GameNameValidator.sanitized(query) != nil else {
            gameSearchResults = []
            isSearchingGames = false
            return
        }
        isSearchingGames = true
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let results = await rawg.searchGameTags(query)
            guard !Task.isCancelled else { return }
            gameSearchResults = results
            isSearchingGames = false
        }
    }

    func signOut() async throws {
        try await auth.signOut()
    }

    func deleteAccount() async throws {
        isLoading = true
        defer { isLoading = false }
        try await auth.deleteAccount()
        AvatarCacheService.shared.clearCache()
    }

    private func uniqueSubscriptions(_ subscriptions: [LocalUserSubscription]) -> [LocalUserSubscription] {
        var seen = Set<String>()
        return subscriptions.filter { seen.insert($0.name.lowercased()).inserted }
    }


    private func subscriptionPayload(_ subscription: LocalUserSubscription) -> [String: AnyEncodable] {
        var payload: [String: AnyEncodable] = [
            "name": AnyEncodable(subscription.name),
            "icon_name": AnyEncodable(subscription.iconName),
            "plan_name": AnyEncodable(subscription.planName ?? ""),
            "billing_cycle_id": AnyEncodable(subscription.billingCycleId ?? ""),
            "auto_renew": AnyEncodable(subscription.autoRenew == true)
        ]
        if let expiresAt = subscription.expiresAt {
            payload["expires_at"] = AnyEncodable(ISO8601DateFormatter().string(from: expiresAt))
        }
        if let startedAt = subscription.startedAt {
            payload["started_at"] = AnyEncodable(ISO8601DateFormatter().string(from: startedAt))
        }
        return payload
    }
}

enum ProfileInputValidator {
    static func username(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (3...30).contains(trimmed.count),
              trimmed.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else {
            return nil
        }
        return trimmed
    }
}

private enum ProfileSaveError: LocalizedError {
    case profileNotReturned

    var errorDescription: String? {
        "profile.error.save.verify".localized
    }
}
