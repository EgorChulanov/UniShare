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
    @Published var selectedGames: [GameTag] = []
    @Published var skillInput = ""
    @Published var skills: [String] = []
    @Published var selectedSubscriptions: Set<String> = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // Game search
    @Published var gameSearchQuery = ""
    @Published var gameSearchResults: [GameTag] = []
    @Published var isSearchingGames = false

    private let auth: FirebaseAuthService
    private let firestore: FirestoreService
    private let storage: StorageService
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

    init(auth: FirebaseAuthService, firestore: FirestoreService, storage: StorageService, rawg: RawgService) {
        self.auth = auth
        self.firestore = firestore
        self.storage = storage
        self.rawg = rawg
    }

    func advance() {
        guard canAdvance else { return }
        let nextRaw = currentStep.rawValue + 1
        if let next = OnboardingStep(rawValue: nextRaw) {
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

    func addSkill() {
        let trimmed = skillInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !skills.contains(trimmed) else { return }
        skills.append(trimmed)
        skillInput = ""
    }

    func removeSkill(_ skill: String) {
        skills.removeAll { $0 == skill }
    }

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

    func toggleGame(_ tag: GameTag) {
        if selectedGames.contains(where: { $0.name == tag.name }) {
            selectedGames.removeAll { $0.name == tag.name }
        } else {
            selectedGames.append(tag)
        }
    }

    func complete(onComplete: @escaping () -> Void) {
        Task {
            await saveProfile(onComplete: onComplete)
        }
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
            profile.games = selectedGames.map { $0.name }
            profile.skills = skills
            profile.subscriptions = selectedSubscriptions.compactMap { name in
                LocalUserSubscription.available.first { $0.name == name }
            }
            profile.onboardingComplete = true

            try await firestore.createUser(profile)
            onComplete()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
