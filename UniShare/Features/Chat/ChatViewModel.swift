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
        let cached = await ChatMessageCacheService.shared.messages(for: chat.id)
        if messages.isEmpty { messages = cached }
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
                await ChatMessageCacheService.shared.store(self.messages, for: self.chat.id)
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
                if let stableImage = await PersistentMediaCache.shared.image(for: path) {
                    await PersistentMediaCache.shared.store(stableImage, for: signed)
                } else if let downloaded = await PersistentMediaCache.shared.load(from: signed) {
                    await PersistentMediaCache.shared.store(downloaded, for: path)
                }
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
        messages.append(msg)

        do {
            try await db.sendMessage(msg, chatId: chat.id)
        } catch {
            messages.removeAll { $0.id == msg.id }
            inputText = text
            errorMessage = friendlyMessage(for: error)
        }
    }

    func sendImage(_ image: UIImage) async {
        guard !isSending else { return }
        isSending = true
        defer { isSending = false }

        let messageID = UUID().uuidString
        let localKey = "local-chat-image://\(messageID)"
        AvatarCacheService.shared.store(image, for: localKey)
        var optimistic = Message(
            id: messageID,
            senderId: myUid,
            imageUrl: localKey,
            createdAt: Date(),
            readBy: [myUid]
        )
        messages.append(optimistic)

        do {
            let path = try await storage.uploadChatImage(image, chatId: chat.id)
            let signedURL = try await storage.signedChatImageURL(path: path)
            AvatarCacheService.shared.store(image, for: signedURL)
            await PersistentMediaCache.shared.store(image, for: path)
            signedImageURLs[path] = signedURL
            optimistic.imageUrl = signedURL
            if let index = messages.firstIndex(where: { $0.id == messageID }) {
                messages[index] = optimistic
            }
            let persisted = Message(
                id: messageID,
                senderId: myUid,
                imageUrl: path,
                createdAt: optimistic.createdAt,
                readBy: [myUid]
            )
            try await db.sendMessage(persisted, chatId: chat.id)
        } catch {
            messages.removeAll { $0.id == messageID }
            errorMessage = friendlyMessage(for: error)
        }
    }

    func deleteChat() async throws {
        let imagePaths = try await db.chatImagePaths(chatId: chat.id)
        try await storage.removeChatImages(paths: imagePaths)
        try await db.deleteChat(id: chat.id)
    }

    private func friendlyMessage(for error: Error) -> String {
        if error.localizedDescription.localizedCaseInsensitiveContains("community rules") {
            return "chat.error.content.blocked".localized
        }
        return error.localizedDescription
    }
}
