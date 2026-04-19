import SwiftUI
import Foundation
import UIKit
import Combine

enum OnboardingStep: Int, CaseIterable {
    case username = 0
    case avatar = 1
    case platform = 2
    case games = 3
    case skills = 4
    case subscriptions = 5
}

@MainActor
final class OnboardingViewModel: ObservableObject {
    @Published var currentStep: OnboardingStep = .username
    @Published var username = ""
    @Published var selectedAvatar: UIImage?
    @Published var selectedPlatforms: Set<Platform> = []
    @Published var gamesByPlatform: [Platform: [GameTag]] = [:]
    @Published var activePlatformTab: Platform? = nil
    @Published var skillInput = ""
    @Published var skills: [String] = []
    @Published var selectedSubscriptions: Set<String> = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // Game search
    @Published var gameSearchQuery = ""
    @Published var gameSearchResults: [GameTag] = []
    @Published var isSearchingGames = false

    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private let storage: SupabaseStorageService
    private let rawg: RawgService
    private var searchTask: Task<Void, Never>?

    var canAdvance: Bool {
        switch currentStep {
        case .username: return username.count >= 3
        case .avatar: return true
        case .platform: return !selectedPlatforms.isEmpty
        case .games: return true
        case .skills: return true
        case .subscriptions: return true
        }
    }

    var isLastStep: Bool { currentStep == .subscriptions }

    init(auth: SupabaseAuthService, db: SupabaseService, storage: SupabaseStorageService, rawg: RawgService) {
        self.auth = auth
        self.db = db
        self.storage = storage
        self.rawg = rawg
    }

    func advance() {
        guard canAdvance else { return }
        let nextRaw = currentStep.rawValue + 1
        if let next = OnboardingStep(rawValue: nextRaw) {
            if next == .games {
                // Reset search and set first platform tab
                gameSearchQuery = ""
                gameSearchResults = []
                activePlatformTab = Platform.allCases.first { selectedPlatforms.contains($0) }
            }
            withAnimation(.easeInOut(duration: 0.3)) {
                currentStep = next
            }
        }
    }

    func goBack() {
        let prevRaw = currentStep.rawValue - 1
        if let prev = OnboardingStep(rawValue: prevRaw) {
            withAnimation(.easeInOut(duration: 0.3)) {
                currentStep = prev
            }
        }
    }

    // MARK: - Games per platform

    func gamesForPlatform(_ platform: Platform) -> [GameTag] {
        gamesByPlatform[platform] ?? []
    }

    func toggleGame(_ tag: GameTag, for platform: Platform) {
        var games = gamesByPlatform[platform] ?? []
        if games.contains(where: { $0.name == tag.name }) {
            games.removeAll { $0.name == tag.name }
        } else {
            games.append(tag)
        }
        gamesByPlatform[platform] = games
    }

    // MARK: - Skills

    func addSkill() {
        let trimmed = skillInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !skills.contains(trimmed) else { return }
        skills.append(trimmed)
        skillInput = ""
    }

    func removeSkill(_ skill: String) {
        skills.removeAll { $0 == skill }
    }

    // MARK: - Game search

    func searchGames(_ query: String) {
        searchTask?.cancel()
        guard !query.isEmpty else {
            gameSearchResults = []
            return
        }
        isSearchingGames = true
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let games = await rawg.searchGames(query)
            let tags = games.map { rawg.gameToTag($0) }
            await MainActor.run {
                gameSearchResults = tags
                isSearchingGames = false
            }
        }
    }

    // MARK: - Complete

    func complete(onComplete: @escaping () -> Void) {
        Task { await saveProfile(onComplete: onComplete) }
    }

    private func saveProfile(onComplete: @escaping () -> Void) async {
        guard let uid = auth.uid else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            var avatarUrl: String?
            if let image = selectedAvatar {
                avatarUrl = try await storage.uploadAvatar(image, uid: uid)
            }

            var profile = UserProfile(uid: uid, username: username)
            profile.avatarUrl = avatarUrl
            profile.platforms = selectedPlatforms.map { $0.rawValue }

            // Save games per platform
            var platformGamesDict: [String: [String]] = [:]
            for (platform, tags) in gamesByPlatform {
                let names = tags.map { $0.name }
                if !names.isEmpty {
                    platformGamesDict[platform.rawValue] = names
                }
            }
            profile.platformGames = platformGamesDict
            profile.games = platformGamesDict.values.flatMap { $0 }

            profile.skills = skills
            profile.subscriptions = selectedSubscriptions.compactMap { name in
                LocalUserSubscription.available.first { $0.name == name }
            }
            profile.onboardingComplete = true

            try await db.createUser(profile)
            onComplete()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
