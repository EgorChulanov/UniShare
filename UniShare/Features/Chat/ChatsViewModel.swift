import Foundation

@MainActor
final class ChatsViewModel: ObservableObject {
    @Published var chats: [Chat] = []
    @Published var exchangeRequests: [LikeRequest] = []
    @Published var skillRequests: [LikeRequest] = []
    @Published var errorMessage: String?
    @Published var partnerProfiles: [String: UserProfile] = [:]

    var requests: [LikeRequest] {
        (exchangeRequests + skillRequests).sorted { $0.createdAt > $1.createdAt }
    }

    private var cancelChats: (() -> Void)?
    private var cancelExchangeRequests: (() -> Void)?
    private var cancelSkillRequests: (() -> Void)?
    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private var hasStarted = false

    init(auth: SupabaseAuthService, db: SupabaseService) {
        self.auth = auth
        self.db = db
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
        do {
            _ = try await db.acceptLikeRequest(id: request.id)
            HapticsManager.shared.playMatch()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func declineRequest(_ request: LikeRequest) async {
        do {
            try await db.deleteLikeRequest(id: request.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
