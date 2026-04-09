import Foundation
import FirebaseFirestore

// MARK: - Message

struct Message: Identifiable, Codable {
    var id: String
    var senderId: String
    var text: String?
    var imageUrl: String?
    var createdAt: Date
    var readBy: [String]

    var isRead: Bool { readBy.count > 1 }

    static func from(_ data: [String: Any], id: String) -> Message? {
        guard let senderId = data["senderId"] as? String else { return nil }
        let timestamp = data["createdAt"] as? Timestamp
        return Message(
            id: id,
            senderId: senderId,
            text: data["text"] as? String,
            imageUrl: data["imageUrl"] as? String,
            createdAt: timestamp?.dateValue() ?? Date(),
            readBy: data["readBy"] as? [String] ?? []
        )
    }

    var firestoreData: [String: Any] {
        var data: [String: Any] = [
            "senderId": senderId,
            "createdAt": Timestamp(date: createdAt),
            "readBy": readBy
        ]
        if let text { data["text"] = text }
        if let imageUrl { data["imageUrl"] = imageUrl }
        return data
    }
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

    static func from(_ data: [String: Any], id: String, currentUid: String) -> Chat? {
        guard let participants = data["participants"] as? [String] else { return nil }
        let timestamp = data["lastMessageAt"] as? Timestamp
        let partnerUid = participants.first { $0 != currentUid } ?? ""
        return Chat(
            id: id,
            participants: participants,
            lastMessage: data["lastMessage"] as? String ?? "",
            lastMessageAt: timestamp?.dateValue() ?? Date(),
            chatType: data["chatType"] as? String ?? "exchange",
            unreadCounts: data["unreadCounts"] as? [String: Int] ?? [:],
            partnerStatus: "offline",
            partnerUid: partnerUid
        )
    }
}

// MARK: - LikeRequest

struct LikeRequest: Identifiable {
    var id: String
    var from: String
    var to: String
    var requestType: String  // "exchange" or "skills"
    var createdAt: Date

    static func from(_ data: [String: Any], id: String) -> LikeRequest? {
        guard
            let from = data["from"] as? String,
            let to = data["to"] as? String
        else { return nil }
        let timestamp = data["createdAt"] as? Timestamp
        return LikeRequest(
            id: id,
            from: from,
            to: to,
            requestType: data["requestType"] as? String ?? "exchange",
            createdAt: timestamp?.dateValue() ?? Date()
        )
    }

    var firestoreData: [String: Any] {
        [
            "from": from,
            "to": to,
            "requestType": requestType,
            "createdAt": Timestamp(date: createdAt)
        ]
    }
}
