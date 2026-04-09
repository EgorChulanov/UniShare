import Foundation
import Combine

@MainActor
final class FeedViewModel: ObservableObject {
    @Published var exchangeCards: [ProfileCard] = []
    @Published var skillCards: [ProfileCard] = []
    @Published var isLoading = false
    @Published var selectedSegment: FeedSegment = .exchange

    // Search
    @Published var searchQuery = ""
    @Published var searchResults: [GameTag] = []
    @Published var isSearching = false

    private var dislikedUids: Set<String> = []
    private var likedUids: Set<String> = []
    private var undoStack: [ProfileCard] = []

    @AppStorage(AppConstants.Feed.undoCountKey) private var undoCount = 0
    @AppStorage(AppConstants.Feed.undoDateKey) private var undoDate = ""

    private let auth: FirebaseAuthService
    private let firestore: FirestoreService
    private let rawg: RawgService
    private var searchTask: Task<Void, Never>?

    var canUndo: Bool {
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        if undoDate != today { undoCount = 0; undoDate = String(today) }
        return undoCount < AppConstants.Feed.maxUndoPerDay && !undoStack.isEmpty
    }

    init(auth: FirebaseAuthService, firestore: FirestoreService, rawg: RawgService) {
        self.auth = auth
        self.firestore = firestore
        self.rawg = rawg
    }

    func loadInitialCards() async {
        guard let myUid = auth.uid else { return }
        isLoading = true
        defer { isLoading = false }

        let excludeUids = [myUid] + Array(dislikedUids) + Array(likedUids)
        let profiles = (try? await firestore.getFeedUsers(excludeUids: excludeUids, limit: AppConstants.Feed.initialBatchSize)) ?? []
        let cards = await withTaskGroup(of: ProfileCard?.self) { group in
            for profile in profiles {
                group.addTask { await self.buildCard(from: profile) }
            }
            var result: [ProfileCard] = []
            for await card in group {
                if let card { result.append(card) }
            }
            return result
        }
        exchangeCards = cards
        skillCards = cards // Skills feed uses same pool; can be filtered differently
    }

    private func buildCard(from profile: UserProfile) async -> ProfileCard {
        let tags = await withTaskGroup(of: GameTag.self) { group in
            for gameName in profile.games.prefix(3) {
                group.addTask {
                    if let games = await self.rawg.searchGames(gameName).first {
                        return self.rawg.gameToTag(games)
                    }
                    return GameTag(name: gameName)
                }
            }
            var tags: [GameTag] = []
            for await tag in group { tags.append(tag) }
            return tags
        }

        let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }
        return ProfileCard(
            username: profile.username,
            subtitle: profile.status ?? "",
            platform: platforms.first,
            platforms: platforms,
            tags: tags,
            userId: profile.uid,
            avatarUrl: profile.avatarUrl,
            subscriptions: profile.subscriptions,
            skills: profile.skills,
            status: profile.status
        )
    }

    func swipeRight(card: ProfileCard, requestType: String) async {
        guard let myUid = auth.uid else { return }
        likedUids.insert(card.userId)
        removeCard(card, from: requestType)

        let requestId = "\(myUid)_\(card.userId)_\(requestType)"
        let request = LikeRequest(
            id: requestId,
            from: myUid,
            to: card.userId,
            requestType: requestType,
            createdAt: Date()
        )
        try? await firestore.sendLikeRequest(request)

        // Check mutual like
        if let existingId = try? await firestore.checkMutualLike(fromUid: myUid, toUid: card.userId, requestType: requestType) {
            _ = try? await firestore.createChat(participants: [myUid, card.userId], chatType: requestType)
            try? await firestore.deleteLikeRequest(id: existingId)
            HapticsManager.shared.playMatch()
        }

        await loadOneMore(requestType: requestType)
    }

    func swipeLeft(card: ProfileCard, requestType: String) {
        dislikedUids.insert(card.userId)
        undoStack.append(card)
        if undoStack.count > 3 { undoStack.removeFirst() }
        removeCard(card, from: requestType)
        HapticsManager.shared.playSwipeLeft()
        Task { await loadOneMore(requestType: requestType) }
    }

    func undo(requestType: String) {
        guard canUndo, let card = undoStack.popLast() else { return }
        dislikedUids.remove(card.userId)
        if requestType == "exchange" {
            exchangeCards.insert(card, at: 0)
        } else {
            skillCards.insert(card, at: 0)
        }
        undoCount += 1
        HapticsManager.shared.impact(.medium)
    }

    private func removeCard(_ card: ProfileCard, from requestType: String) {
        if requestType == "exchange" {
            exchangeCards.removeAll { $0.id == card.id }
        } else {
            skillCards.removeAll { $0.id == card.id }
        }
    }

    private func loadOneMore(requestType: String) async {
        guard let myUid = auth.uid else { return }
        let excludeUids = [myUid] + Array(dislikedUids) + Array(likedUids)
        let profiles = (try? await firestore.getFeedUsers(excludeUids: excludeUids, limit: 1)) ?? []
        for profile in profiles {
            let card = await buildCard(from: profile)
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
            let results = await rawg.searchGames(query).map { rawg.gameToTag($0) }
            await MainActor.run { searchResults = results; isSearching = false }
        }
    }
}

enum FeedSegment: String, CaseIterable {
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
