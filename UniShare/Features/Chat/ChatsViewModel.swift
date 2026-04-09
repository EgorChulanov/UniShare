import Foundation
import FirebaseFirestore

@MainActor
final class ChatsViewModel: ObservableObject {
    @Published var exchangeChats: [Chat] = []
    @Published var skillChats: [Chat] = []
    @Published var exchangeRequests: [LikeRequest] = []
    @Published var skillRequests: [LikeRequest] = []
    @Published var selectedSegment: ChatsSegment = .exchange
    @Published var isLoading = false

    // Cache for partner names/avatars
    @Published var partnerProfiles: [String: UserProfile] = [:]

    private var chatListener: ListenerRegistration?
    private var exchangeRequestListener: ListenerRegistration?
    private var skillRequestListener: ListenerRegistration?

    private let auth: FirebaseAuthService
    private let firestore: FirestoreService

    init(auth: FirebaseAuthService, firestore: FirestoreService) {
        self.auth = auth
        self.firestore = firestore
    }

    deinit {
        chatListener?.remove()
        exchangeRequestListener?.remove()
        skillRequestListener?.remove()
    }

    func startListening() {
        guard let uid = auth.uid else { return }

        chatListener = firestore.listenToChats(uid: uid) { [weak self] chats in
            guard let self else { return }
            Task { @MainActor in
                self.exchangeChats = chats.filter { $0.chatType == "exchange" }
                self.skillChats = chats.filter { $0.chatType == "skills" }
                await self.loadPartnerProfiles(for: chats, currentUid: uid)
            }
        }

        exchangeRequestListener = firestore.listenToLikeRequests(toUid: uid, requestType: "exchange") { [weak self] requests in
            self?.exchangeRequests = requests
        }

        skillRequestListener = firestore.listenToLikeRequests(toUid: uid, requestType: "skills") { [weak self] requests in
            self?.skillRequests = requests
        }
    }

    private func loadPartnerProfiles(for chats: [Chat], currentUid: String) async {
        for chat in chats {
            let partnerUid = chat.partnerUid
            guard partnerProfiles[partnerUid] == nil else { continue }
            if let profile = try? await firestore.getUser(uid: partnerUid) {
                partnerProfiles[partnerUid] = profile
                await AvatarCacheService.shared.loadUserAvatar(from: profile.avatarUrl)
            }
        }
    }

    func acceptRequest(_ request: LikeRequest) async {
        guard let myUid = auth.uid else { return }
        do {
            _ = try await firestore.createChat(participants: [myUid, request.from], chatType: request.requestType)
            try await firestore.deleteLikeRequest(id: request.id)
            HapticsManager.shared.playMatch()
        } catch {
            print("Accept request failed: \(error)")
        }
    }

    func declineRequest(_ request: LikeRequest) async {
        try? await firestore.deleteLikeRequest(id: request.id)
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
