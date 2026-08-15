import Foundation
import UIKit

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var inputText = ""
    @Published var isSending = false
    @Published var partnerProfile: UserProfile?
    @Published var isPartnerOnline = false
    @Published var errorMessage: String?

    let chat: Chat

    private var cancelMessages: (() -> Void)?
    private var cancelStatus: (() -> Void)?

    private let auth: SupabaseAuthService
    private let db: SupabaseService
    private let storage: SupabaseStorageService
    private var signedImageURLs: [String: String] = [:]

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
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.messages = await self.resolveImageURLs(in: messages)
            }
        }
    }

    private func resolveImageURLs(in messages: [Message]) async -> [Message] {
        var resolved = messages
        for index in resolved.indices {
            guard let path = resolved[index].imageUrl, !path.hasPrefix("http") else { continue }
            if let cached = signedImageURLs[path] {
                resolved[index].imageUrl = cached
            } else if let signed = try? await storage.signedChatImageURL(path: path) {
                signedImageURLs[path] = signed
                resolved[index].imageUrl = signed
            }
        }
        return resolved
    }

    private func startStatusListener() {
        cancelStatus = db.listenToUserStatus(uid: chat.partnerUid) { [weak self] isOnline in
            Task { @MainActor [weak self] in self?.isPartnerOnline = isOnline }
        }
    }

    private func markAsRead() async {
        try? await db.markChatAsRead(chatId: chat.id)
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
        } catch {
            inputText = text
            errorMessage = friendlyMessage(for: error)
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
        } catch {
            errorMessage = friendlyMessage(for: error)
        }
    }

    private func friendlyMessage(for error: Error) -> String {
        if error.localizedDescription.localizedCaseInsensitiveContains("community rules") {
            return "chat.error.content.blocked".localized
        }
        return error.localizedDescription
    }
}
