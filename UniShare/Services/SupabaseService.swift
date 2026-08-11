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
    var subscriptions: [SupabaseSubscriptionRow]
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
            subscriptions: profile.subscriptions.map { SupabaseSubscriptionRow.from($0) },
            onboardingComplete: profile.onboardingComplete,
            isOnline: profile.isOnline,
            lastSeen: profile.lastSeen,
            rating: profile.rating,
            reviewCount: nil
        )
    }
}

struct SupabaseSubscriptionRow: Codable {
    var name: String
    var iconName: String
    var url: String?
    var planName: String?
    var expiresAt: Date?
    var details: String?
    var startedAt: Date?
    var billingCycleId: String?
    var autoRenew: Bool?
    var sharedSlots: Int?

    private enum CodingKeys: String, CodingKey {
        case name, url, details
        case iconName = "icon_name"
        case legacyIconName = "iconName"
        case planName = "plan_name"
        case expiresAt = "expires_at"
        case startedAt = "started_at"
        case billingCycleId = "billing_cycle_id"
        case autoRenew = "auto_renew"
        case sharedSlots = "shared_slots"
    }

    init(name: String, iconName: String, url: String?, planName: String? = nil, expiresAt: Date? = nil, details: String? = nil, startedAt: Date? = nil, billingCycleId: String? = nil, autoRenew: Bool? = nil, sharedSlots: Int? = nil) {
        self.name = name
        self.iconName = iconName
        self.url = url
        self.planName = planName
        self.expiresAt = expiresAt
        self.details = details
        self.startedAt = startedAt
        self.billingCycleId = billingCycleId
        self.autoRenew = autoRenew
        self.sharedSlots = sharedSlots
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        iconName = try container.decodeIfPresent(String.self, forKey: .iconName)
            ?? container.decodeIfPresent(String.self, forKey: .legacyIconName)
            ?? "link"
        url = try container.decodeIfPresent(String.self, forKey: .url)
        planName = try container.decodeIfPresent(String.self, forKey: .planName)
        expiresAt = try container.decodeIfPresent(Date.self, forKey: .expiresAt)
        details = try container.decodeIfPresent(String.self, forKey: .details)
        startedAt = try container.decodeIfPresent(Date.self, forKey: .startedAt)
        billingCycleId = try container.decodeIfPresent(String.self, forKey: .billingCycleId)
        autoRenew = try container.decodeIfPresent(Bool.self, forKey: .autoRenew)
        sharedSlots = try container.decodeIfPresent(Int.self, forKey: .sharedSlots)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(iconName, forKey: .iconName)
        try container.encodeIfPresent(url, forKey: .url)
        try container.encodeIfPresent(planName, forKey: .planName)
        try container.encodeIfPresent(expiresAt, forKey: .expiresAt)
        try container.encodeIfPresent(details, forKey: .details)
        try container.encodeIfPresent(startedAt, forKey: .startedAt)
        try container.encodeIfPresent(billingCycleId, forKey: .billingCycleId)
        try container.encodeIfPresent(autoRenew, forKey: .autoRenew)
        try container.encodeIfPresent(sharedSlots, forKey: .sharedSlots)
    }

    func toLocalUserSubscription() -> LocalUserSubscription {
        LocalUserSubscription(name: name, url: nil, iconName: iconName, planName: planName, expiresAt: expiresAt, details: nil, startedAt: startedAt, billingCycleId: billingCycleId, autoRenew: autoRenew, sharedSlots: nil)
    }

    static func from(_ sub: LocalUserSubscription) -> SupabaseSubscriptionRow {
        SupabaseSubscriptionRow(name: sub.name, iconName: sub.iconName, url: nil, planName: sub.planName, expiresAt: sub.expiresAt, details: nil, startedAt: sub.startedAt, billingCycleId: sub.billingCycleId, autoRenew: sub.autoRenew, sharedSlots: nil)
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

private struct SendLikeParams: Encodable {
    let targetUid: String
    let kind: String
    let requestId: String

    enum CodingKeys: String, CodingKey {
        case targetUid = "target_uid"
        case kind
        case requestId = "request_id"
    }
}

private struct FeedParams: Encodable {
    let kind: String
    let batchLimit: Int

    enum CodingKeys: String, CodingKey {
        case kind
        case batchLimit = "batch_limit"
    }
}

private struct SwipeParams: Encodable {
    let targetUid: String
    let kind: String
    let swipeDecision: String

    enum CodingKeys: String, CodingKey {
        case targetUid = "target_uid"
        case kind
        case swipeDecision = "swipe_decision"
    }
}

private struct UndoSwipeParams: Encodable {
    let targetUid: String
    let kind: String

    enum CodingKeys: String, CodingKey {
        case targetUid = "target_uid"
        case kind
    }
}

private struct MatchResultRow: Decodable {
    let matched: Bool
    let chatId: String?

    enum CodingKeys: String, CodingKey {
        case matched
        case chatId = "chat_id"
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

private struct AcceptLikeParams: Encodable {
    let requestId: String

    enum CodingKeys: String, CodingKey {
        case requestId = "request_id"
    }
}

private struct SendMessageParams: Encodable {
    let messageId: String
    let targetChatId: String
    let messageText: String?
    let messageImageUrl: String?

    enum CodingKeys: String, CodingKey {
        case messageId = "message_id"
        case targetChatId = "target_chat_id"
        case messageText = "message_text"
        case messageImageUrl = "message_image_url"
    }
}

private struct MarkChatReadParams: Encodable {
    let targetChatId: String

    enum CodingKeys: String, CodingKey {
        case targetChatId = "target_chat_id"
    }
}

private struct StoryRow: Decodable {
    let id: String
    let title: String
    let subtitle: String
    let body: String
    let imageUrl: String?
    let symbol: String
    let accentHex: String
    let ctaTitle: String?
    let ctaUrl: String?
    let publishedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, subtitle, body, symbol
        case imageUrl = "image_url"
        case accentHex = "accent_hex"
        case ctaTitle = "cta_title"
        case ctaUrl = "cta_url"
        case publishedAt = "published_at"
    }

    func toStory(isSeen: Bool) -> CommunityStory {
        CommunityStory(
            id: id,
            title: title,
            subtitle: subtitle,
            body: body,
            imageUrl: imageUrl,
            symbol: symbol,
            accentHex: accentHex,
            ctaTitle: ctaTitle,
            ctaUrl: ctaUrl,
            publishedAt: publishedAt,
            isSeen: isSeen
        )
    }
}

private struct StoryViewRow: Decodable {
    let storyId: String

    enum CodingKeys: String, CodingKey {
        case storyId = "story_id"
    }
}

private struct StoryViewInsert: Encodable {
    let storyId: String
    let userId: String
    let viewedAt: Date

    enum CodingKeys: String, CodingKey {
        case storyId = "story_id"
        case userId = "user_id"
        case viewedAt = "viewed_at"
    }
}

private struct ReportInsert: Encodable {
    let reporterId: String
    let subjectId: String
    let reason: String
    let details: String

    enum CodingKeys: String, CodingKey {
        case reporterId = "reporter_id"
        case subjectId = "subject_id"
        case reason, details
    }
}

private struct BlockInsert: Encodable {
    let blockerId: String
    let blockedId: String

    enum CodingKeys: String, CodingKey {
        case blockerId = "blocker_id"
        case blockedId = "blocked_id"
    }
}

// MARK: - SupabaseService

final class SupabaseService {
    private let client = SupabaseManager.shared.client

    // MARK: - Users

    func createUser(_ profile: UserProfile) async throws {
        let row = UserRow.from(profile)
        try await client.from("users")
            .upsert(row, onConflict: "uid")
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

    func getFeedProfiles(kind: String, limit: Int = 12) async throws -> [UserProfile] {
        let rows: [UserRow] = try await client.rpc(
            "get_feed_profiles",
            params: FeedParams(kind: kind, batchLimit: limit)
        )
        .execute()
        .value
        return rows.map { $0.toUserProfile() }
    }

    func recordDislike(targetUid: String, kind: String) async throws {
        try await client.rpc(
            "record_swipe",
            params: SwipeParams(targetUid: targetUid, kind: kind, swipeDecision: "dislike")
        )
        .execute()
    }

    func undoDislike(targetUid: String, kind: String) async throws -> Bool {
        try await client.rpc(
            "undo_dislike",
            params: UndoSwipeParams(targetUid: targetUid, kind: kind)
        )
        .execute()
        .value
    }

    func listenToUserStatus(uid: String, completion: @escaping (Bool) -> Void) -> () -> Void {
        let task = Task {
            while !Task.isCancelled {
                if let profile = try? await getUser(uid: uid) {
                    await MainActor.run { completion(profile.isOnline) }
                }
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
        return { task.cancel() }
    }

    // MARK: - Like Requests

    func sendLikeRequest(_ request: LikeRequest) async throws -> String? {
        let rows: [MatchResultRow] = try await client.rpc(
            "send_like",
            params: SendLikeParams(
                targetUid: request.to,
                kind: request.requestType,
                requestId: request.id
            )
        )
        .execute()
        .value
        return rows.first(where: { $0.matched })?.chatId
    }

    func deleteLikeRequest(id: String) async throws {
        try await client.from("like_requests")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    func listenToLikeRequests(toUid: String, requestType: String, completion: @escaping ([LikeRequest]) -> Void) -> () -> Void {
        let task = Task {
            while !Task.isCancelled {
                let rows: [LikeRequestRow] = (try? await client.from("like_requests")
                    .select()
                    .eq("to_uid", value: toUid)
                    .eq("request_type", value: requestType)
                    .execute()
                    .value) ?? []
                await MainActor.run { completion(rows.map { $0.toLikeRequest() }) }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
        return { task.cancel() }
    }

    // MARK: - Chats

    func acceptLikeRequest(id: String) async throws -> String {
        let chatId: String = try await client.rpc(
            "accept_like_request",
            params: AcceptLikeParams(requestId: id)
        )
        .execute()
        .value
        return chatId
    }

    func listenToChats(uid: String, completion: @escaping ([Chat]) -> Void) -> () -> Void {
        let channel = client.channel("chats-\(uid)-\(UUID().uuidString)")
        let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "chats")
        let task = Task {
            let refresh = {
                let rows: [ChatRow] = (try? await self.client.from("chats")
                    .select()
                    .contains("participants", value: [uid])
                    .execute()
                    .value) ?? []
                let chats = rows
                    .compactMap { $0.toChat(currentUid: uid) }
                    .sorted { $0.lastMessageAt > $1.lastMessageAt }
                await MainActor.run { completion(chats) }
            }

            await refresh()
            do {
                try await channel.subscribeWithError()
                for await _ in changes {
                    guard !Task.isCancelled else { break }
                    await refresh()
                }
            } catch {
                while !Task.isCancelled {
                    await refresh()
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                }
            }
        }
        return {
            task.cancel()
            Task { await self.client.removeChannel(channel) }
        }
    }

    func markChatAsRead(chatId: String) async throws {
        try await client.rpc(
            "mark_chat_read",
            params: MarkChatReadParams(targetChatId: chatId)
        )
        .execute()
    }

    // MARK: - Messages

    func sendMessage(_ message: Message, chatId: String) async throws {
        try await client.rpc(
            "send_chat_message",
            params: SendMessageParams(
                messageId: message.id,
                targetChatId: chatId,
                messageText: message.text,
                messageImageUrl: message.imageUrl
            )
        )
        .execute()
    }

    func listenToMessages(chatId: String, completion: @escaping ([Message]) -> Void) -> () -> Void {
        let channel = client.channel("messages-\(chatId)-\(UUID().uuidString)")
        let changes = channel.postgresChange(
            AnyAction.self,
            schema: "public",
            table: "messages",
            filter: .eq("chat_id", value: chatId)
        )
        let task = Task {
            let refresh = {
                let rows: [MessageRow] = (try? await self.client.from("messages")
                    .select()
                    .eq("chat_id", value: chatId)
                    .order("created_at", ascending: true)
                    .execute()
                    .value) ?? []
                await MainActor.run { completion(rows.map { $0.toMessage() }) }
            }

            await refresh()
            do {
                try await channel.subscribeWithError()
                for await _ in changes {
                    guard !Task.isCancelled else { break }
                    await refresh()
                }
            } catch {
                while !Task.isCancelled {
                    await refresh()
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                }
            }
        }
        return {
            task.cancel()
            Task { await self.client.removeChannel(channel) }
        }
    }

    // MARK: - Community Stories

    func getStories(userId: String) async throws -> [CommunityStory] {
        async let storyRows: [StoryRow] = client.from("stories")
            .select()
            .order("priority", ascending: false)
            .order("published_at", ascending: false)
            .execute()
            .value
        async let viewRows: [StoryViewRow] = client.from("story_views")
            .select("story_id")
            .eq("user_id", value: userId)
            .execute()
            .value

        let (stories, views) = try await (storyRows, viewRows)
        let seenIds = Set(views.map(\.storyId))
        return stories.map { $0.toStory(isSeen: seenIds.contains($0.id)) }
    }

    func markStoryViewed(storyId: String, userId: String) async throws {
        let row = StoryViewInsert(storyId: storyId, userId: userId, viewedAt: Date())
        try await client.from("story_views")
            .upsert(row, onConflict: "story_id,user_id")
            .execute()
    }

    // MARK: - Moderation

    func submitReport(reporterId: String, subjectId: String, reason: String, details: String) async throws {
        let report = ReportInsert(
            reporterId: reporterId,
            subjectId: subjectId,
            reason: reason,
            details: details
        )
        try await client.from("reports")
            .insert(report)
            .execute()
    }

    func blockUser(blockerId: String, blockedId: String) async throws {
        try await client.from("blocks")
            .upsert(BlockInsert(blockerId: blockerId, blockedId: blockedId))
            .execute()
    }

    // MARK: - Reviews

    func submitReview(_ review: Review) async throws {
        try await client.from("reviews")
            .insert(review)
            .execute()
    }

    func submitReview(fromUid: String, toUid: String, chatId: String, rating: Int, text: String?) async throws {
        let review = Review(
            id: "\(fromUid)_\(toUid)_\(chatId)",
            fromUid: fromUid,
            toUid: toUid,
            chatId: chatId,
            rating: rating,
            reviewText: text,
            createdAt: Date()
        )
        try await submitReview(review)
    }

    func hasReviewed(fromUid: String, toUid: String, chatId: String) async throws -> Bool {
        let id = "\(fromUid)_\(toUid)_\(chatId)"
        let rows: [Review] = (try? await client.from("reviews")
            .select()
            .eq("id", value: id)
            .limit(1)
            .execute()
            .value) ?? []
        return !rows.isEmpty
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
        case invalidParticipants

        var errorDescription: String? {
            switch self {
            case .invalidParticipants: return "A chat requires two different participants"
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
