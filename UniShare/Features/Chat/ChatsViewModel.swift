import Foundation

@MainActor
final class ChatsViewModel: ObservableObject {
    @Published var chats: [Chat] = []
    @Published var exchangeRequests: [LikeRequest] = []
    @Published var skillRequests: [LikeRequest] = []
    @Published var errorMessage: String?
    @Published var partnerProfiles: [String: UserProfile] = [:]
    @Published var processingRequestIds = Set<String>()
    @Published var stories: [CommunityStory] = []

    var requests: [LikeRequest] {
        (exchangeRequests + skillRequests).sorted { $0.createdAt > $1.createdAt }
    }

    private var cancelChats: (() -> Void)?
    private var cancelExchangeRequests: (() -> Void)?
    private var cancelSkillRequests: (() -> Void)?
    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private let storage: SupabaseStorageService
    private var hasStarted = false

    init(auth: SupabaseAuthService, db: SupabaseService, storage: SupabaseStorageService) {
        self.auth = auth
        self.db = db
        self.storage = storage
    }

    deinit {
        cancelChats?()
        cancelExchangeRequests?()
        cancelSkillRequests?()
    }

    func startListening() {
        guard !hasStarted, let uid = auth.uid else { return }
        hasStarted = true

        cancelChats = db.listenToChats(uid: uid) { [weak self] chats in
            Task { @MainActor [weak self] in
                self?.chats = chats.sorted { $0.lastMessageAt > $1.lastMessageAt }
                await self?.loadPartnerProfiles(for: chats)
            }
        }
        cancelExchangeRequests = db.listenToLikeRequests(toUid: uid, requestType: "exchange") { [weak self] requests in
            Task { @MainActor [weak self] in self?.exchangeRequests = requests }
        }
        cancelSkillRequests = db.listenToLikeRequests(toUid: uid, requestType: "skills") { [weak self] requests in
            Task { @MainActor [weak self] in self?.skillRequests = requests }
        }
        Task { await loadStories() }
    }

    func loadStories() async {
        guard let uid = auth.uid else { return }
        stories = (try? await db.getStories(userId: uid)) ?? []
    }

    func markStoryViewed(_ story: CommunityStory) async {
        guard let uid = auth.uid else { return }
        if let index = stories.firstIndex(where: { $0.id == story.id }) { stories[index].isSeen = true }
        try? await db.markStoryViewed(storyId: story.id, userId: uid)
    }

    func deleteChat(_ chat: Chat) async {
        chats.removeAll { $0.id == chat.id }
        do {
            let imagePaths = try await db.chatImagePaths(chatId: chat.id)
            try await storage.removeChatImages(paths: imagePaths)
            try await db.deleteChat(id: chat.id)
        } catch {
            if !chats.contains(where: { $0.id == chat.id }) { chats.append(chat) }
            chats.sort { $0.lastMessageAt > $1.lastMessageAt }
            errorMessage = error.localizedDescription
        }
    }

    private func loadPartnerProfiles(for chats: [Chat]) async {
        for chat in chats where partnerProfiles[chat.partnerUid] == nil {
            if let profile = try? await db.getUser(uid: chat.partnerUid) {
                partnerProfiles[chat.partnerUid] = profile
            }
        }
    }

    func loadProfile(for request: LikeRequest) async {
        guard partnerProfiles[request.from] == nil else { return }
        partnerProfiles[request.from] = try? await db.getUser(uid: request.from)
    }

    func acceptRequest(_ request: LikeRequest) async {
        guard processingRequestIds.insert(request.id).inserted else { return }
        removeRequestLocally(request)
        defer { processingRequestIds.remove(request.id) }
        do {
            _ = try await db.acceptLikeRequest(id: request.id)
            HapticsManager.shared.playMatch()
        } catch {
            restoreRequestLocally(request)
            errorMessage = error.localizedDescription
        }
    }

    func declineRequest(_ request: LikeRequest) async {
        guard processingRequestIds.insert(request.id).inserted else { return }
        removeRequestLocally(request)
        defer { processingRequestIds.remove(request.id) }
        do {
            try await db.deleteLikeRequest(id: request.id)
        } catch {
            restoreRequestLocally(request)
            errorMessage = error.localizedDescription
        }
    }

    private func removeRequestLocally(_ request: LikeRequest) {
        exchangeRequests.removeAll { $0.id == request.id }
        skillRequests.removeAll { $0.id == request.id }
    }

    private func restoreRequestLocally(_ request: LikeRequest) {
        if request.requestType == "skills" {
            guard !skillRequests.contains(where: { $0.id == request.id }) else { return }
            skillRequests.append(request)
        } else {
            guard !exchangeRequests.contains(where: { $0.id == request.id }) else { return }
            exchangeRequests.append(request)
        }
    }
}
