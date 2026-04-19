import Foundation
import UIKit

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var inputText = ""
    @Published var isSending = false
    @Published var partnerProfile: UserProfile?
    @Published var isPartnerOnline = false

    let chat: Chat

    private var cancelMessages: (() -> Void)?
    private var cancelStatus: (() -> Void)?

    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private let storage: SupabaseStorageService

    var myUid: String { auth.uid ?? "" }
    var partnerUid: String? { chat.participants.first { $0 != auth.uid } }

    init(chat: Chat, auth: SupabaseAuthService, db: SupabaseService, storage: SupabaseStorageService) {
        self.chat = chat
        self.auth = auth
        self.db = db
        self.storage = storage
    }

    deinit {
        cancelMessages?()
        cancelStatus?()
    }

    func start() async {
        await loadPartnerProfile()
        startMessageListener()
        startStatusListener()
        await markAsRead()
    }

    private func loadPartnerProfile() async {
        if let profile = try? await db.getUser(uid: chat.partnerUid) {
            partnerProfile = profile
            await AvatarCacheService.shared.loadUserAvatar(from: profile.avatarUrl)
        }
    }

    private func startMessageListener() {
        cancelMessages = db.listenToMessages(chatId: chat.id) { [weak self] messages in
            Task { @MainActor [weak self] in self?.messages = messages }
        }
    }

    private func startStatusListener() {
        cancelStatus = db.listenToUserStatus(uid: chat.partnerUid) { [weak self] isOnline in
            Task { @MainActor [weak self] in self?.isPartnerOnline = isOnline }
        }
    }

    private func markAsRead() async {
        try? await db.markChatAsRead(chatId: chat.id, uid: myUid)
    }

    func sendText() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        inputText = ""
        isSending = true
        defer { isSending = false }

        let msg = Message(
            id: UUID().uuidString,
            senderId: myUid,
            text: text,
            createdAt: Date(),
            readBy: [myUid]
        )

        do {
            try await db.sendMessage(msg, chatId: chat.id)
            try await db.updateChatLastMessage(
                chatId: chat.id,
                message: text,
                senderId: myUid,
                participants: chat.participants
            )
        } catch {
            print("Send message failed: \(error)")
        }
    }

    func sendImage(_ image: UIImage) async {
        isSending = true
        defer { isSending = false }

        do {
            let url = try await storage.uploadChatImage(image, chatId: chat.id)
            let msg = Message(
                id: UUID().uuidString,
                senderId: myUid,
                imageUrl: url,
                createdAt: Date(),
                readBy: [myUid]
            )
            try await db.sendMessage(msg, chatId: chat.id)
            try await db.updateChatLastMessage(
                chatId: chat.id,
                message: "📷 Photo",
                senderId: myUid,
                participants: chat.participants
            )
        } catch {
            print("Send image failed: \(error)")
        }
    }
}
