import Foundation
import FirebaseFirestore
import Combine

final class FirestoreService {
    private let db = Firestore.firestore()

    // MARK: - Users

    func createUser(_ profile: UserProfile) async throws {
        try await db.collection(AppConstants.Firestore.users)
            .document(profile.uid)
            .setData(profile.firestoreData)
    }

    func getUser(uid: String) async throws -> UserProfile? {
        let doc = try await db.collection(AppConstants.Firestore.users).document(uid).getDocument()
        guard let data = doc.data() else { return nil }
        return UserProfile.from(data, uid: uid)
    }

    func updateUser(uid: String, data: [String: Any]) async throws {
        try await db.collection(AppConstants.Firestore.users).document(uid).updateData(data)
    }

    func getFeedUsers(excludeUids: [String], limit: Int = 3, skillsOnly: Bool = false) async throws -> [UserProfile] {
        var query: Query = db.collection(AppConstants.Firestore.users)
            .whereField("onboardingComplete", isEqualTo: true)

        if skillsOnly {
            query = query.whereField("hasSkillsProfile", isEqualTo: true)
        }

        let snapshot = try await query.limit(to: limit + excludeUids.count + 1).getDocuments()
        return snapshot.documents.compactMap { doc in
            guard !excludeUids.contains(doc.documentID) else { return nil }
            return UserProfile.from(doc.data(), uid: doc.documentID)
        }.prefix(limit).map { $0 }
    }

    func listenToUserStatus(uid: String, completion: @escaping (Bool) -> Void) -> ListenerRegistration {
        db.collection(AppConstants.Firestore.users).document(uid)
            .addSnapshotListener { snapshot, _ in
                guard let data = snapshot?.data() else { return }
                completion(data["isOnline"] as? Bool ?? false)
            }
    }

    // MARK: - Like Requests

    func sendLikeRequest(_ request: LikeRequest) async throws {
        try await db.collection(AppConstants.Firestore.likeRequests)
            .document(request.id)
            .setData([
                "from": request.from,
                "to": request.to,
                "requestType": request.requestType,
                "createdAt": Timestamp(date: request.createdAt)
            ])
    }

    func deleteLikeRequest(id: String) async throws {
        try await db.collection(AppConstants.Firestore.likeRequests).document(id).delete()
    }

    func checkMutualLike(fromUid: String, toUid: String, requestType: String) async throws -> String? {
        let snapshot = try await db.collection(AppConstants.Firestore.likeRequests)
            .whereField("from", isEqualTo: toUid)
            .whereField("to", isEqualTo: fromUid)
            .whereField("requestType", isEqualTo: requestType)
            .getDocuments()
        return snapshot.documents.first?.documentID
    }

    func listenToLikeRequests(toUid: String, requestType: String, completion: @escaping ([LikeRequest]) -> Void) -> ListenerRegistration {
        db.collection(AppConstants.Firestore.likeRequests)
            .whereField("to", isEqualTo: toUid)
            .whereField("requestType", isEqualTo: requestType)
            .addSnapshotListener { snapshot, _ in
                let requests: [LikeRequest] = snapshot?.documents.compactMap { doc in
                    let d = doc.data()
                    guard let from = d["from"] as? String, let to = d["to"] as? String else { return nil }
                    return LikeRequest(id: doc.documentID, from: from, to: to,
                                       requestType: d["requestType"] as? String ?? "exchange",
                                       createdAt: (d["createdAt"] as? Timestamp)?.dateValue() ?? Date())
                } ?? []
                completion(requests)
            }
    }

    // MARK: - Chats

    func createChat(participants: [String], chatType: String) async throws -> String {
        let ref = db.collection(AppConstants.Firestore.chats).document()
        let data: [String: Any] = [
            "participants": participants,
            "lastMessage": "",
            "lastMessageAt": Timestamp(date: Date()),
            "chatType": chatType,
            "unreadCounts": Dictionary(uniqueKeysWithValues: participants.map { ($0, 0) })
        ]
        try await ref.setData(data)
        return ref.documentID
    }

    func listenToChats(uid: String, completion: @escaping ([Chat]) -> Void) -> ListenerRegistration {
        // No orderBy — avoids composite Firestore index that causes the listener
        // to silently error and wipe the list on first real fetch.
        db.collection(AppConstants.Firestore.chats)
            .whereField("participants", arrayContains: uid)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    print("Chats listener error: \(error)")
                    return
                }
                let chats: [Chat] = (snapshot?.documents ?? [])
                    .compactMap { doc -> Chat? in
                        let d = doc.data()
                        guard let participants = d["participants"] as? [String] else { return nil }
                        let partnerUid = participants.first { $0 != uid } ?? ""
                        return Chat(id: doc.documentID, participants: participants,
                                    lastMessage: d["lastMessage"] as? String ?? "",
                                    lastMessageAt: (d["lastMessageAt"] as? Timestamp)?.dateValue() ?? Date(),
                                    chatType: d["chatType"] as? String ?? "exchange",
                                    unreadCounts: d["unreadCounts"] as? [String: Int] ?? [:],
                                    partnerStatus: "offline", partnerUid: partnerUid)
                    }
                    .sorted { $0.lastMessageAt > $1.lastMessageAt }
                completion(chats)
            }
    }

    func updateChatLastMessage(chatId: String, message: String, senderId: String, participants: [String]) async throws {
        var unreadUpdates: [String: Any] = [:]
        for uid in participants where uid != senderId {
            unreadUpdates["unreadCounts.\(uid)"] = FieldValue.increment(Int64(1))
        }
        var data: [String: Any] = [
            "lastMessage": message,
            "lastMessageAt": Timestamp(date: Date())
        ]
        data.merge(unreadUpdates) { _, new in new }
        try await db.collection(AppConstants.Firestore.chats).document(chatId).updateData(data)
    }

    func markChatAsRead(chatId: String, uid: String) async throws {
        try await db.collection(AppConstants.Firestore.chats).document(chatId).updateData([
            "unreadCounts.\(uid)": 0
        ])
    }

    // MARK: - Messages

    func sendMessage(_ message: Message, chatId: String) async throws {
        try await db.collection(AppConstants.Firestore.chats)
            .document(chatId)
            .collection(AppConstants.Firestore.messages)
            .document(message.id)
            .setData({
                var d: [String: Any] = [
                    "senderId": message.senderId,
                    "createdAt": Timestamp(date: message.createdAt),
                    "readBy": message.readBy
                ]
                if let text = message.text { d["text"] = text }
                if let url = message.imageUrl { d["imageUrl"] = url }
                return d
            }())
    }

    func listenToMessages(chatId: String, completion: @escaping ([Message]) -> Void) -> ListenerRegistration {
        db.collection(AppConstants.Firestore.chats)
            .document(chatId)
            .collection(AppConstants.Firestore.messages)
            .order(by: "createdAt")
            .addSnapshotListener { snapshot, _ in
                let messages: [Message] = snapshot?.documents.compactMap { doc in
                    let d = doc.data()
                    guard let senderId = d["senderId"] as? String else { return nil }
                    return Message(id: doc.documentID, senderId: senderId,
                                   text: d["text"] as? String, imageUrl: d["imageUrl"] as? String,
                                   createdAt: (d["createdAt"] as? Timestamp)?.dateValue() ?? Date(),
                                   readBy: d["readBy"] as? [String] ?? [])
                } ?? []
                completion(messages)
            }
    }

    func markMessageRead(chatId: String, messageId: String, uid: String) async throws {
        try await db.collection(AppConstants.Firestore.chats)
            .document(chatId)
            .collection(AppConstants.Firestore.messages)
            .document(messageId)
            .updateData(["readBy": FieldValue.arrayUnion([uid])])
    }

    // MARK: - Reviews / Ratings

    func submitReview(fromUid: String, toUid: String, chatId: String, rating: Int, text: String?) async throws {
        let id = "\(fromUid)_\(toUid)_\(chatId)"
        var data: [String: Any] = [
            "fromUid": fromUid,
            "toUid": toUid,
            "chatId": chatId,
            "rating": rating,
            "createdAt": Timestamp(date: Date())
        ]
        if let text { data["reviewText"] = text }
        try await db.collection("reviews").document(id).setData(data)

        // Update target user's aggregate rating
        let reviews = try await db.collection("reviews")
            .whereField("toUid", isEqualTo: toUid)
            .getDocuments()
        let ratings = reviews.documents.compactMap { $0.data()["rating"] as? Int }
        let avg = ratings.isEmpty ? 0.0 : Double(ratings.reduce(0, +)) / Double(ratings.count)
        try await db.collection(AppConstants.Firestore.users).document(toUid).updateData([
            "rating": avg,
            "reviewCount": ratings.count
        ])
    }

    func hasReviewed(fromUid: String, toUid: String, chatId: String) async throws -> Bool {
        let id = "\(fromUid)_\(toUid)_\(chatId)"
        let doc = try await db.collection("reviews").document(id).getDocument()
        return doc.exists
    }

    // MARK: - AI Requests

    func saveAIRequest(userId: String, message: String, response: String) async throws {
        let data: [String: Any] = [
            "userId": userId,
            "message": message,
            "response": response,
            "createdAt": Timestamp(date: Date())
        ]
        try await db.collection(AppConstants.Firestore.aiRequests).addDocument(data: data)
    }
}
