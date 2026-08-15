import SwiftUI
import Foundation
import Combine

@MainActor
final class FeedViewModel: ObservableObject {
    @Published var exchangeCards: [ProfileCard] = []
    @Published var skillCards: [ProfileCard] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var selectedSegment: FeedSegment = .exchange
    @Published var stories: [CommunityStory] = []

    @Published var searchQuery = ""
    @Published var searchResults: [GameTag] = []
    @Published var isSearching = false

    private var undoStack: [ProfileCard] = []

    @AppStorage(AppConstants.Feed.undoCountKey) private var undoCount = 0
    @AppStorage(AppConstants.Feed.undoDateKey) private var undoDate = ""

    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private let rawg: RawgService
    private var searchTask: Task<Void, Never>?

    var canUndo: Bool {
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        if undoDate != today { undoCount = 0; undoDate = String(today) }
        return undoCount < AppConstants.Feed.maxUndoPerDay && !undoStack.isEmpty
    }

    init(auth: SupabaseAuthService, db: SupabaseService, rawg: RawgService) {
        self.auth = auth
        self.db = db
        self.rawg = rawg
    }

    func loadInitialCards() async {
        guard let myUid = auth.uid else { return }
        isLoading = true
        defer { isLoading = false }

        async let exchangeProfiles = (try? await db.getFeedProfiles(
            kind: "exchange", limit: AppConstants.Feed.initialBatchSize
        )) ?? []

        async let skillProfiles = (try? await db.getFeedProfiles(
            kind: "skills", limit: AppConstants.Feed.initialBatchSize
        )) ?? []

        async let loadedStories = (try? await db.getStories(userId: myUid)) ?? []
        let (ep, sp, storyItems) = await (exchangeProfiles, skillProfiles, loadedStories)

        exchangeCards = ep.map { buildCard(from: $0, coverUrlMap: [:]) }
        skillCards = sp.map { buildCard(from: $0, coverUrlMap: [:]) }
        stories = storyItems

        Task { await enrichCards(from: ep, requestType: "exchange") }
        Task { await enrichCards(from: sp, requestType: "skills") }
    }

    func markStoryViewed(_ story: CommunityStory) async {
        guard let uid = auth.uid else { return }
        if let index = stories.firstIndex(where: { $0.id == story.id }) {
            stories[index].isSeen = true
        }
        try? await db.markStoryViewed(storyId: story.id, userId: uid)
    }

    private func buildCardsWithCovers(from profiles: [UserProfile]) async -> [ProfileCard] {
        await withTaskGroup(of: ProfileCard?.self) { group in
            for profile in profiles {
                group.addTask { await self.buildCardWithCovers(from: profile) }
            }
            var result: [ProfileCard] = []
            for await card in group {
                if let card { result.append(card) }
            }
            return result
        }
    }

    private func buildCardWithCovers(from profile: UserProfile) async -> ProfileCard {
        let allNames = Array(Set(profile.platformGames.values.flatMap { $0 } + profile.games)).prefix(12)

        let coverUrlMap: [String: String] = await withTaskGroup(of: (String, String?).self) { group in
            for name in allNames {
                group.addTask {
                    if let game = await self.rawg.searchGames(name).first {
                        return (name, game.backgroundImage)
                    }
                    return (name, nil)
                }
            }
            var result: [String: String] = [:]
            for await (name, url) in group {
                if let url { result[name] = url }
            }
            return result
        }

        return buildCard(from: profile, coverUrlMap: coverUrlMap)
    }

    private func buildCard(from profile: UserProfile, coverUrlMap: [String: String]) -> ProfileCard {
        let platformGameTags = profile.platformGames.mapValues { names in
            names.map { name in GameTag(name: name, coverUrl: coverUrlMap[name]) }
        }

        let tags = profile.games.prefix(3).map { name in
            GameTag(name: name, coverUrl: coverUrlMap[name])
        }

        let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }
        return ProfileCard(
            username: profile.username,
            subtitle: profile.status ?? "",
            platform: platforms.first,
            platforms: platforms,
            tags: Array(tags),
            platformGames: profile.platformGames,
            platformGameTags: platformGameTags,
            userId: profile.uid,
            avatarUrl: profile.avatarUrl,
            subscriptions: profile.subscriptions,
            skills: profile.skills,
            status: profile.status,
            rating: profile.rating
        )
    }

    private func enrichCards(from profiles: [UserProfile], requestType: String) async {
        let enriched = await buildCardsWithCovers(from: profiles)
        guard !Task.isCancelled else { return }

        for card in enriched {
            if requestType == "exchange",
               let index = exchangeCards.firstIndex(where: { $0.userId == card.userId }) {
                exchangeCards[index] = card
            } else if requestType == "skills",
                      let index = skillCards.firstIndex(where: { $0.userId == card.userId }) {
                skillCards[index] = card
            }
        }
    }

    func swipeRight(card: ProfileCard, requestType: String) async {
        guard let myUid = auth.uid else { return }
        removeCard(card, from: requestType)

        let requestId = "\(myUid)_\(card.userId)_\(requestType)"
        let request = LikeRequest(
            id: requestId,
            from: myUid,
            to: card.userId,
            requestType: requestType,
            createdAt: Date()
        )
        do {
            if try await db.sendLikeRequest(request) != nil {
                HapticsManager.shared.playMatch()
            }
        } catch {
            if requestType == "exchange" { exchangeCards.insert(card, at: 0) }
            else { skillCards.insert(card, at: 0) }
            errorMessage = error.localizedDescription
            return
        }

        await loadOneMore(requestType: requestType)
    }

    func swipeLeft(card: ProfileCard, requestType: String) {
        undoStack.append(card)
        if undoStack.count > 3 { undoStack.removeFirst() }
        removeCard(card, from: requestType)
        HapticsManager.shared.playSwipeLeft()
        Task {
            do {
                try await db.recordDislike(targetUid: card.userId, kind: requestType)
                await loadOneMore(requestType: requestType)
            } catch {
                undoStack.removeAll { $0.userId == card.userId }
                if requestType == "exchange" { exchangeCards.insert(card, at: 0) }
                else { skillCards.insert(card, at: 0) }
                errorMessage = error.localizedDescription
            }
        }
    }

    func undo(requestType: String) {
        guard canUndo, let card = undoStack.popLast() else { return }
        Task {
            do {
                guard try await db.undoDislike(targetUid: card.userId, kind: requestType) else { return }
                if requestType == "exchange" { exchangeCards.insert(card, at: 0) }
                else { skillCards.insert(card, at: 0) }
                undoCount += 1
                HapticsManager.shared.impact(.medium)
            } catch {
                undoStack.append(card)
                errorMessage = error.localizedDescription
            }
        }
    }

    private func removeCard(_ card: ProfileCard, from requestType: String) {
        if requestType == "exchange" {
            exchangeCards.removeAll { $0.id == card.id }
        } else {
            skillCards.removeAll { $0.id == card.id }
        }
    }

    private func loadOneMore(requestType: String) async {
        guard auth.uid != nil else { return }
        let profiles = (try? await db.getFeedProfiles(kind: requestType, limit: 1)) ?? []
        for profile in profiles {
            let card = buildCard(from: profile, coverUrlMap: [:])
            if requestType == "exchange" { exchangeCards.append(card) }
            else { skillCards.append(card) }
        }
        Task { await enrichCards(from: profiles, requestType: requestType) }
    }

    func searchGames(_ query: String) {
        searchTask?.cancel()
        guard !query.isEmpty else { searchResults = []; return }
        isSearching = true
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let results = await rawg.searchGameTags(query)
            await MainActor.run { searchResults = results; isSearching = false }
        }
    }
}

enum FeedSegment: String, CaseIterable, Hashable {
    case exchange, skills

    var localizedKey: String {
        switch self {
        case .exchange: return "feed.segment.exchange"
        case .skills: return "feed.segment.skills"
        }
    }

    var requestType: String {
        switch self {
        case .exchange: return "exchange"
        case .skills: return "skills"
        }
    }
}
