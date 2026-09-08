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
    @Published var searchQuery = ""
    @Published var searchResults: [GameTag] = []
    @Published var isSearching = false

    private var undoStack: [ProfileCard] = []

    @AppStorage(AppConstants.Feed.undoCountKey) private var undoCount = 0
    @AppStorage(AppConstants.Feed.undoDateKey) private var undoDate = ""

    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private let rawg: RawgService
    private let dismissalStore: FeedDismissalStore
    private var searchTask: Task<Void, Never>?
    private var loadingContexts = Set<String>()
    private var viewerGameNames = Set<String>()

    var canUndo: Bool {
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        if undoDate != today { undoCount = 0; undoDate = String(today) }
        return undoCount < AppConstants.Feed.maxUndoPerDay && !undoStack.isEmpty
    }

    init(
        auth: SupabaseAuthService,
        db: SupabaseService,
        rawg: RawgService,
        dismissalStore: FeedDismissalStore = FeedDismissalStore()
    ) {
        self.auth = auth
        self.db = db
        self.rawg = rawg
        self.dismissalStore = dismissalStore
    }

    func loadInitialCards() async {
        guard let myUid = auth.uid else { return }
        isLoading = true
        defer { isLoading = false }

        if let viewer = try? await db.getUser(uid: myUid) {
            viewerGameNames = Set(
                (viewer.games + viewer.platformGames.values.flatMap { $0 })
                    .map(GameNameValidator.normalized)
            )
        }

        async let exchangeProfiles = (try? await db.getFeedProfiles(
            kind: "exchange", limit: AppConstants.Feed.initialBatchSize
        )) ?? []

        async let skillProfiles = (try? await db.getFeedProfiles(
            kind: "skills", limit: AppConstants.Feed.initialBatchSize
        )) ?? []

        let (rawExchange, rawSkills) = await (exchangeProfiles, skillProfiles)
        let ep = rawExchange.filter { !dismissalStore.contains(userID: $0.uid, context: "exchange") }
        let sp = rawSkills.filter { !dismissalStore.contains(userID: $0.uid, context: "skills") }

        // Profiles should remain usable even when the cover provider is slow or unavailable.
        exchangeCards = ep.map { buildCard(from: $0, coverUrlMap: [:]) }
        skillCards = sp.map { buildCard(from: $0, coverUrlMap: [:]) }

        async let enrichedExchangeCards = buildCards(from: ep)
        async let enrichedSkillCards = buildCards(from: sp)
        let (enrichedExchange, enrichedSkills) = await (enrichedExchangeCards, enrichedSkillCards)
        exchangeCards = enrichedExchange
        skillCards = enrichedSkills
    }

    private func buildCards(from profiles: [UserProfile]) async -> [ProfileCard] {
        await withTaskGroup(of: (Int, ProfileCard).self) { group in
            for (index, profile) in profiles.enumerated() {
                group.addTask { (index, await self.buildCardWithCovers(from: profile)) }
            }
            var result = Array<ProfileCard?>(repeating: nil, count: profiles.count)
            for await (index, card) in group {
                result[index] = card
            }
            return result.compactMap { $0 }
        }
    }

    private func buildCardWithCovers(from profile: UserProfile) async -> ProfileCard {
        let allNames = Array(Set(
            profile.platformGames.values.flatMap { $0 }
                + profile.games
                + profile.wantedGames
        )).prefix(20)

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

        let wantedTags = profile.wantedGames.prefix(8).map { name in
            GameTag(name: name, coverUrl: coverUrlMap[name])
        }

        let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }
        return ProfileCard(
            username: profile.username,
            subtitle: profile.status ?? "",
            platform: platforms.first,
            platforms: platforms,
            tags: Array(tags),
            wantedGames: profile.wantedGames,
            wantedGameTags: Array(wantedTags),
            platformGames: profile.platformGames,
            platformGameTags: platformGameTags,
            userId: profile.uid,
            avatarUrl: profile.avatarUrl,
            subscriptions: profile.subscriptions,
            skills: profile.skills,
            skillsDescription: profile.skillsDescription,
            skillsPortfolioUrls: profile.skillsPortfolioUrls,
            status: profile.status,
            rating: profile.rating,
            cardDesign: profile.cardDesign,
            matchingOwnedGames: Set(
                profile.wantedGames
                    .filter { viewerGameNames.contains(GameNameValidator.normalized($0)) }
                    .map(GameNameValidator.normalized)
            )
        )
    }

    func swipeRight(card: ProfileCard, requestType: String) async {
        guard let myUid = auth.uid else { return }
        dismissalStore.record(userID: card.userId, context: requestType)
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
            dismissalStore.remove(userID: card.userId, context: requestType)
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
        dismissalStore.record(userID: card.userId, context: requestType)
        removeCard(card, from: requestType)
        HapticsManager.shared.playSwipeLeft()
        Task {
            do {
                try await db.recordDislike(targetUid: card.userId, kind: requestType)
                await loadOneMore(requestType: requestType)
            } catch {
                dismissalStore.remove(userID: card.userId, context: requestType)
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
                dismissalStore.remove(userID: card.userId, context: requestType)
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
        guard auth.uid != nil, !loadingContexts.contains(requestType) else { return }
        loadingContexts.insert(requestType)
        defer { loadingContexts.remove(requestType) }

        let profiles = (try? await db.getFeedProfiles(kind: requestType, limit: 6)) ?? []
        let existingIds = Set((requestType == "exchange" ? exchangeCards : skillCards).map(\.userId))
        for profile in profiles where
            !existingIds.contains(profile.uid) &&
            !dismissalStore.contains(userID: profile.uid, context: requestType) {
            let card = await buildCardWithCovers(from: profile)
            if requestType == "exchange" { exchangeCards.append(card) }
            else { skillCards.append(card) }
        }
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
