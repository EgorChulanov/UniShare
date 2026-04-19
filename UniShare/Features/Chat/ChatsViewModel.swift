import Foundation

@MainActor
final class ChatsViewModel: ObservableObject {
    @Published var exchangeChats: [Chat] = []
    @Published var skillChats: [Chat] = []
    @Published var exchangeRequests: [LikeRequest] = []
    @Published var skillRequests: [LikeRequest] = []
    @Published var selectedSegment: ChatsSegment = .exchange
    @Published var isLoading = false

    @Published var partnerProfiles: [String: UserProfile] = [:]

    private var cancelChats: (() -> Void)?
    private var cancelExchangeRequests: (() -> Void)?
    private var cancelSkillRequests: (() -> Void)?

    private let auth: SupabaseAuthService
    private let db: SupabaseService

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
        guard let uid = auth.uid else { return }

        cancelChats = db.listenToChats(uid: uid) { [weak self] chats in
            guard let self else { return }
            Task { @MainActor in
                self.exchangeChats = chats.filter { $0.chatType == "exchange" }
                self.skillChats = chats.filter { $0.chatType == "skills" }
                await self.loadPartnerProfiles(for: chats, currentUid: uid)
            }
        }

        cancelExchangeRequests = db.listenToLikeRequests(toUid: uid, requestType: "exchange") { [weak self] requests in
            Task { @MainActor [weak self] in self?.exchangeRequests = requests }
        }

        cancelSkillRequests = db.listenToLikeRequests(toUid: uid, requestType: "skills") { [weak self] requests in
            Task { @MainActor [weak self] in self?.skillRequests = requests }
        }
    }

    private func loadPartnerProfiles(for chats: [Chat], currentUid: String) async {
        for chat in chats {
            let partnerUid = chat.partnerUid
            guard partnerProfiles[partnerUid] == nil else { continue }
            if let profile = try? await db.getUser(uid: partnerUid) {
                partnerProfiles[partnerUid] = profile
                await AvatarCacheService.shared.loadUserAvatar(from: profile.avatarUrl)
            }
        }
    }

    func acceptRequest(_ request: LikeRequest) async {
        guard let myUid = auth.uid else { return }
        do {
            _ = try await db.createChat(participants: [myUid, request.from], chatType: request.requestType)
            try await db.deleteLikeRequest(id: request.id)
            HapticsManager.shared.playMatch()
        } catch {
            print("Accept request failed: \(error)")
        }
    }

    func declineRequest(_ request: LikeRequest) async {
        try? await db.deleteLikeRequest(id: request.id)
    }
}

enum ChatsSegment: CaseIterable {
    case exchange, skills

    var localizedKey: String {
        switch self {
        case .exchange: return "chats.segment.exchange"
        case .skills: return "chats.segment.skills"
        }
    }
}
