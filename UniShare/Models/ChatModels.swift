import Foundation

// MARK: - Message

struct Message: Identifiable, Codable {
    var id: String
    var senderId: String
    var text: String?
    var imageUrl: String?
    var createdAt: Date
    var readBy: [String]

    var isRead: Bool { readBy.count > 1 }
}

// MARK: - Chat

struct Chat: Identifiable {
    var id: String
    var participants: [String]
    var lastMessage: String
    var lastMessageAt: Date
    var chatType: String  // "exchange" or "skills"
    var unreadCounts: [String: Int]
    var partnerStatus: String  // "online" or "offline"
    var partnerUid: String

    func unreadCount(for uid: String) -> Int {
        unreadCounts[uid] ?? 0
    }
}

// MARK: - LikeRequest

struct LikeRequest: Identifiable {
    var id: String
    var from: String
    var to: String
    var requestType: String  // "exchange" or "skills"
    var createdAt: Date
}
