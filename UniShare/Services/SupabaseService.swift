import Foundation
import Supabase

// MARK: - Codable row types mapping to Supabase tables

private struct UserRow: Codable {
    var uid: String
    var username: String
    var avatarUrl: String?
    var status: String?
    var games: [String]
    var wantedGames: [String]
    var platforms: [String]
    var platformGames: [String: [String]]
    var skills: [String]
    var skillsDescription: String?
    var hasSkillsProfile: Bool
    var subscriptions: [SubscriptionRow]
    var onboardingComplete: Bool
    var isOnline: Bool
    var lastSeen: Date?
    var rating: Double
    var reviewCount: Int?

    enum CodingKeys: String, CodingKey {
        case uid
        case username
        case avatarUrl = "avatar_url"
        case status
        case games
        case wantedGames = "wanted_games"
        case platforms
        case platformGames = "platform_games"
        case skills
        case skillsDescription = "skills_description"
        case hasSkillsProfile = "has_skills_profile"
        case subscriptions
        case onboardingComplete = "onboarding_complete"
        case isOnline = "is_online"
        case lastSeen = "last_seen"
        case rating
        case reviewCount = "review_count"
    }

    func toUserProfile() -> UserProfile {
        var profile = UserProfile(uid: uid, username: username)
        profile.avatarUrl = avatarUrl
        profile.status = status
        profile.games = games
        profile.wantedGames = wantedGames
        profile.platforms = platforms
        profile.platformGames = platformGames
        profile.skills = skills
        profile.skillsDescription = skillsDescription
        profile.hasSkillsProfile = hasSkillsProfile
        profile.subscriptions = subscriptions.map { $0.toLocalUserSubscription() }
        profile.onboardingComplete = onboardingComplete
        profile.isOnline = isOnline
        profile.lastSeen = lastSeen
        profile.rating = rating
        return profile
    }

    static func from(_ profile: UserProfile) -> UserRow {
        UserRow(
            uid: profile.uid,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
            status: profile.status,
            games: profile.games,
            wantedGames: profile.wantedGames,
            platforms: profile.platforms,
            platformGames: profile.platformGames,
            skills: profile.skills,
            skillsDescription: profile.skillsDescription,
            hasSkillsProfile: profile.hasSkillsProfile,
            subscriptions: profile.subscriptions.map { SubscriptionRow.from($0) },
            onboardingComplete: profile.onboardingComplete,
            isOnline: profile.isOnline,
            lastSeen: profile.lastSeen,
            rating: profile.rating,
            reviewCount: nil
        )
    }
}

private struct SubscriptionRow: Codable {
    var name: String
    var iconName: String
    var url: String?

    func toLocalUserSubscription() -> LocalUserSubscription {
        LocalUserSubscription(name: name, url: url, iconName: iconName)
    }

    static func from(_ sub: LocalUserSubscription) -> SubscriptionRow {
        SubscriptionRow(name: sub.name, iconName: sub.iconName, url: sub.url)
    }
}

private struct LikeRequestRow: Codable {
    var id: String
    var fromUid: String
    var toUid: String
    var requestType: String
    var createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case fromUid = "from_uid"
        case toUid = "to_uid"
        case requestType = "request_type"
        case createdAt = "created_at"
    }

    func toLikeRequest() -> LikeRequest {
        LikeRequest(id: id, from: fromUid, to: toUid, requestType: requestType, createdAt: createdAt)
    }
}

private struct ChatRow: Codable {
    var id: String
    var participants: [String]
    var lastMessage: String?
    var lastMessageAt: Date?
    var chatType: String?
    var unreadCounts: [String: Int]?
    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case participants
        case lastMessage = "last_message"
        case lastMessageAt = "last_message_at"
        case chatType = "chat_type"
        case unreadCounts = "unread_counts"
        case createdAt = "created_at"
    }

    func toChat(currentUid: String) -> Chat? {
        let partnerUid = participants.first { $0 != currentUid } ?? ""
        return Chat(
            id: id,
            participants: participants,
            lastMessage: lastMessage ?? "",
            lastMessageAt: lastMessageAt ?? Date(),
            chatType: chatType ?? "exchange",
            unreadCounts: unreadCounts ?? [:],
            partnerStatus: "offline",
            partnerUid: partnerUid
        )
    }
}

private struct MessageRow: Codable {
    var id: String
    var chatId: String
    var senderId: String
    var text: String?
    var imageUrl: String?
    var createdAt: Date
    var readBy: [String]

    enum CodingKeys: String, CodingKey {
        case id
        case chatId = "chat_id"
        case senderId = "sender_id"
        case text
        case imageUrl = "image_url"
        case createdAt = "created_at"
        case readBy = "read_by"
    }

    func toMessage() -> Message {
        Message(
            id: id,
            senderId: senderId,
            text: text,
            imageUrl: imageUrl,
            createdAt: createdAt,
            readBy: readBy
        )
    }
}

private struct AIRequestInsert: Encodable {
    var userId: String
    var message: String
    var response: String
    var createdAt: Date

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case message
        case response
        case createdAt = "created_at"
    }
}

private struct MessageInsert: Encodable {
    var id: String
    var chatId: String
    var senderId: String
    var text: String?
    var imageUrl: String?
    var createdAt: Date
    var readBy: [String]

    enum CodingKeys: String, CodingKey {
        case id
        case chatId = "chat_id"
        case senderId = "sender_id"
        case text
        case imageUrl = "image_url"
        case createdAt = "created_at"
        case readBy = "read_by"
    }
}

private struct ChatInsert: Encodable {
    var participants: [String]
    var lastMessage: String
    var lastMessageAt: Date
    var chatType: String
    var unreadCounts: [String: Int]

    enum CodingKeys: String, CodingKey {
        case participants
        case lastMessage = "last_message"
        case lastMessageAt = "last_message_at"
        case chatType = "chat_type"
        case unreadCounts = "unread_counts"
    }
}

private struct ChatRowId: Decodable {
    var id: String
}

// MARK: - SupabaseService

final class SupabaseService {
    private let client = SupabaseManager.shared.client

    // MARK: - Users

    func createUser(_ profile: UserProfile) async throws {
        let row = UserRow.from(profile)
        try await client.from("users")
            .insert(row)
            .execute()
    }

    func getUser(uid: String) async throws -> UserProfile? {
        let rows: [UserRow] = try await client.from("users")
            .select()
            .eq("uid", value: uid)
            .limit(1)
            .execute()
            .value
        return rows.first?.toUserProfile()
    }

    func updateUser(uid: String, data: [String: AnyEncodable]) async throws {
        try await client.from("users")
            .update(data)
            .eq("uid", value: uid)
            .execute()
    }

    func getFeedUsers(excludeUids: [String], limit: Int = 3, skillsOnly: Bool = false) async throws -> [UserProfile] {
        var query = client.from("users")
            .select()
            .eq("onboarding_complete", value: true)

        if skillsOnly {
            query = query.eq("has_skills_profile", value: true)
        }

        if !excludeUids.isEmpty {
            query = query.not("uid", operator: .in, value: excludeUids)
        }

        let rows: [UserRow] = try await query
            .limit(limit)
            .execute()
            .value

        return rows.map { $0.toUserProfile() }
    }

    func listenToUserStatus(uid: String, completion: @escaping (Bool) -> Void) -> () -> Void {
        let channel = client.channel("user-status-\(uid)")

        let task = Task {
            await channel.on(
                .postgresChanges,
                filter: ChannelFilter(
                    event: .update,
                    schema: "public",
                    table: "users",
                    filter: "uid=eq.\(uid)"
                )
            ) { payload in
                if let record = payload.record,
                   let isOnline = record["is_online"]?.value as? Bool {
                    completion(isOnline)
                }
            }
            await channel.subscribe()
        }

        // Fetch initial value
        Task {
            if let profile = try? await getUser(uid: uid) {
                completion(profile.isOnline)
            }
        }

        return {
            task.cancel()
            Task { await channel.unsubscribe() }
        }
    }

    // MARK: - Like Requests

    func sendLikeRequest(_ request: LikeRequest) async throws {
        let row = LikeRequestRow(
            id: request.id,
            fromUid: request.from,
            toUid: request.to,
            requestType: request.requestType,
            createdAt: request.createdAt
        )
        try await client.from("like_requests")
            .insert(row)
            .execute()
    }

    func deleteLikeRequest(id: String) async throws {
        try await client.from("like_requests")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    func checkMutualLike(fromUid: String, toUid: String, requestType: String) async throws -> String? {
        let rows: [LikeRequestRow] = try await client.from("like_requests")
            .select()
            .eq("from_uid", value: toUid)
            .eq("to_uid", value: fromUid)
            .eq("request_type", value: requestType)
            .limit(1)
            .execute()
            .value
        return rows.first?.id
    }

    func listenToLikeRequests(toUid: String, requestType: String, completion: @escaping ([LikeRequest]) -> Void) -> () -> Void {
        let channel = client.channel("like-requests-\(toUid)-\(requestType)")

        let task = Task {
            await channel.on(
                .postgresChanges,
                filter: ChannelFilter(
                    event: .all,
                    schema: "public",
                    table: "like_requests",
                    filter: "to_uid=eq.\(toUid)"
                )
            ) { [weak self] _ in
                guard let self else { return }
                Task {
                    let rows: [LikeRequestRow] = (try? await self.client.from("like_requests")
                        .select()
                        .eq("to_uid", value: toUid)
                        .eq("request_type", value: requestType)
                        .execute()
                        .value) ?? []
                    completion(rows.map { $0.toLikeRequest() })
                }
            }
            await channel.subscribe()
        }

        // Fetch initial value
        Task {
            let rows: [LikeRequestRow] = (try? await client.from("like_requests")
                .select()
                .eq("to_uid", value: toUid)
                .eq("request_type", value: requestType)
                .execute()
                .value) ?? []
            completion(rows.map { $0.toLikeRequest() })
        }

        return {
            task.cancel()
            Task { await channel.unsubscribe() }
        }
    }

    // MARK: - Chats

    func createChat(participants: [String], chatType: String) async throws -> String {
        let unreadCounts = Dictionary(uniqueKeysWithValues: participants.map { ($0, 0) })
        let insert = ChatInsert(
            participants: participants,
            lastMessage: "",
            lastMessageAt: Date(),
            chatType: chatType,
            unreadCounts: unreadCounts
        )
        let rows: [ChatRowId] = try await client.from("chats")
            .insert(insert)
            .select("id")
            .execute()
            .value
        guard let id = rows.first?.id else {
            throw ServiceError.noIdReturned
        }
        return id
    }

    func listenToChats(uid: String, completion: @escaping ([Chat]) -> Void) -> () -> Void {
        let channel = client.channel("chats-\(uid)")

        let fetchChats: () -> Void = { [weak self] in
            guard let self else { return }
            Task {
                let rows: [ChatRow] = (try? await self.client.from("chats")
                    .select()
                    .contains("participants", value: [uid])
                    .execute()
                    .value) ?? []
                let chats = rows
                    .compactMap { $0.toChat(currentUid: uid) }
                    .sorted { $0.lastMessageAt > $1.lastMessageAt }
                completion(chats)
            }
        }

        let task = Task {
            await channel.on(
                .postgresChanges,
                filter: ChannelFilter(
                    event: .all,
                    schema: "public",
                    table: "chats"
                )
            ) { _ in
                fetchChats()
            }
            await channel.subscribe()
        }

        // Fetch initial value
        fetchChats()

        return {
            task.cancel()
            Task { await channel.unsubscribe() }
        }
    }

    func updateChatLastMessage(chatId: String, message: String, senderId: String, participants: [String]) async throws {
        // First fetch current unread counts
        let rows: [ChatRow] = (try? await client.from("chats")
            .select()
            .eq("id", value: chatId)
            .limit(1)
            .execute()
            .value) ?? []

        var unreadCounts = rows.first?.unreadCounts ?? [:]
        for participantUid in participants where participantUid != senderId {
            unreadCounts[participantUid] = (unreadCounts[participantUid] ?? 0) + 1
        }

        let isoDate = ISO8601DateFormatter().string(from: Date())
        let data: [String: AnyEncodable] = [
            "last_message": AnyEncodable(message),
            "last_message_at": AnyEncodable(isoDate),
            "unread_counts": AnyEncodable(unreadCounts)
        ]
        try await client.from("chats")
            .update(data)
            .eq("id", value: chatId)
            .execute()
    }

    func markChatAsRead(chatId: String, uid: String) async throws {
        // Fetch current unread counts, zero out the given uid
        let rows: [ChatRow] = (try? await client.from("chats")
            .select()
            .eq("id", value: chatId)
            .limit(1)
            .execute()
            .value) ?? []

        var unreadCounts = rows.first?.unreadCounts ?? [:]
        unreadCounts[uid] = 0

        let data: [String: AnyEncodable] = [
            "unread_counts": AnyEncodable(unreadCounts)
        ]
        try await client.from("chats")
            .update(data)
            .eq("id", value: chatId)
            .execute()
    }

    // MARK: - Messages

    func sendMessage(_ message: Message, chatId: String) async throws {
        let insert = MessageInsert(
            id: message.id,
            chatId: chatId,
            senderId: message.senderId,
            text: message.text,
            imageUrl: message.imageUrl,
            createdAt: message.createdAt,
            readBy: message.readBy
        )
        try await client.from("messages")
            .insert(insert)
            .execute()
    }

    func listenToMessages(chatId: String, completion: @escaping ([Message]) -> Void) -> () -> Void {
        let channel = client.channel("messages-\(chatId)")

        let fetchMessages: () -> Void = { [weak self] in
            guard let self else { return }
            Task {
                let rows: [MessageRow] = (try? await self.client.from("messages")
                    .select()
                    .eq("chat_id", value: chatId)
                    .order("created_at", ascending: true)
                    .execute()
                    .value) ?? []
                completion(rows.map { $0.toMessage() })
            }
        }

        let task = Task {
            await channel.on(
                .postgresChanges,
                filter: ChannelFilter(
                    event: .all,
                    schema: "public",
                    table: "messages",
                    filter: "chat_id=eq.\(chatId)"
                )
            ) { _ in
                fetchMessages()
            }
            await channel.subscribe()
        }

        // Fetch initial value
        fetchMessages()

        return {
            task.cancel()
            Task { await channel.unsubscribe() }
        }
    }

    func markMessageRead(chatId: String, messageId: String, uid: String) async throws {
        // Fetch current read_by array
        let rows: [MessageRow] = (try? await client.from("messages")
            .select()
            .eq("id", value: messageId)
            .limit(1)
            .execute()
            .value) ?? []

        var readBy = rows.first?.readBy ?? []
        if !readBy.contains(uid) {
            readBy.append(uid)
        }

        let data: [String: AnyEncodable] = [
            "read_by": AnyEncodable(readBy)
        ]
        try await client.from("messages")
            .update(data)
            .eq("id", value: messageId)
            .execute()
    }

    // MARK: - AI Requests

    func saveAIRequest(userId: String, message: String, response: String) async throws {
        let insert = AIRequestInsert(
            userId: userId,
            message: message,
            response: response,
            createdAt: Date()
        )
        try await client.from("ai_requests")
            .insert(insert)
            .execute()
    }

    // MARK: - Reviews

    func submitReview(_ review: Review) async throws {
        try await client.from("reviews")
            .insert(review)
            .execute()
    }

    func getReviews(forUid: String) async throws -> [Review] {
        let reviews: [Review] = try await client.from("reviews")
            .select()
            .eq("to_uid", value: forUid)
            .order("created_at", ascending: false)
            .execute()
            .value
        return reviews
    }

    // MARK: - Errors

    enum ServiceError: LocalizedError {
        case noIdReturned

        var errorDescription: String? {
            switch self {
            case .noIdReturned: return "No ID was returned from insert"
            }
        }
    }
}

// MARK: - AnyEncodable helper

/// Type-erased Encodable wrapper for building heterogeneous dictionaries.
struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        _encode = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
