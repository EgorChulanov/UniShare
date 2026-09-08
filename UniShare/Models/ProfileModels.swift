import Foundation
import SwiftUI

// MARK: - Platform

enum Platform: String, CaseIterable, Codable {
    case steam = "Steam"
    case epicGames = "Epic Games"
    case nintendo = "Nintendo"
    case playstation = "PlayStation"
    case xbox = "Xbox"
    case pc = "PC"
    case mobile = "Mobile"

    var icon: String {
        switch self {
        case .steam: return "gamecontroller"
        case .epicGames: return "gamecontroller"
        case .nintendo: return "gamecontroller.fill"
        case .playstation: return "playstation.logo"
        case .xbox: return "xbox.logo"
        case .pc: return "desktopcomputer"
        case .mobile: return "apple.logo"
        }
    }

    var color: Color {
        switch self {
        case .steam: return Color(hex: "#1B2838")
        case .epicGames: return Color(hex: "#313131")
        case .nintendo: return Color(hex: "#E60012")
        case .playstation: return Color(hex: "#003791")
        case .xbox: return Color(hex: "#107C10")
        case .pc: return Color(hex: "#0078D4")
        case .mobile: return Color.primary
        }
    }

    var brandAssetName: String? {
        switch self {
        case .steam: return "Brand-steam"
        case .epicGames: return "Brand-epicgames"
        case .nintendo: return "Brand-nintendo"
        case .playstation: return "Brand-playstation"
        case .xbox: return "Brand-xbox"
        case .pc, .mobile: return nil
        }
    }
}

// MARK: - GameTag

struct GameTag: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var coverUrl: String?
    var rawgId: Int?

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: GameTag, rhs: GameTag) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - LocalUserSubscription

struct LocalUserSubscription: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var url: String?
    var iconName: String
    var planName: String? = nil
    var expiresAt: Date? = nil
    var details: String? = nil
    var startedAt: Date? = nil
    var billingCycleId: String? = nil
    var autoRenew: Bool? = nil
    var sharedSlots: Int? = nil

    var brandAssetName: String? {
        switch name.lowercased() {
        case let value where value.contains("twitch"): return "Brand-twitch"
        case let value where value.contains("youtube"): return "Brand-youtube"
        case let value where value.contains("discord"): return "Brand-discord"
        case let value where value.contains("steam"): return "Brand-steam"
        case let value where value.contains("playstation"): return "Brand-playstation"
        case let value where value.contains("nintendo"): return "Brand-nintendo"
        case let value where value.contains("xbox"): return "Brand-xbox"
        case let value where value.contains("ea play"): return "Brand-ea"
        case let value where value.contains("ubisoft"): return "Brand-ubisoft"
        case let value where value.contains("geforce"): return "Brand-nvidia"
        default: return nil
        }
    }

    var definition: SubscriptionDefinition? {
        SubscriptionCatalog.definition(named: name)
    }

    var remainingFraction: Double? {
        guard let startedAt, let expiresAt, expiresAt > startedAt else { return nil }
        return min(max(expiresAt.timeIntervalSinceNow / expiresAt.timeIntervalSince(startedAt), 0), 1)
    }

    var daysRemaining: Int? {
        guard let expiresAt else { return nil }
        return max(Int(ceil(expiresAt.timeIntervalSinceNow / 86_400)), 0)
    }

    static let available: [LocalUserSubscription] = [
        LocalUserSubscription(name: "Twitch", url: nil, iconName: "video.fill"),
        LocalUserSubscription(name: "YouTube Premium", url: nil, iconName: "play.rectangle.fill"),
        LocalUserSubscription(name: "Discord", url: nil, iconName: "bubble.left.fill"),
        LocalUserSubscription(name: "Xbox Game Pass", url: nil, iconName: "xbox.logo"),
        LocalUserSubscription(name: "PlayStation Plus", url: nil, iconName: "playstation.logo"),
        LocalUserSubscription(name: "Nintendo Switch Online", url: nil, iconName: "gamecontroller.fill"),
        LocalUserSubscription(name: "EA Play", url: nil, iconName: "sportscourt"),
        LocalUserSubscription(name: "Ubisoft+", url: nil, iconName: "u.circle"),
        LocalUserSubscription(name: "GeForce Now", url: nil, iconName: "bolt.fill")
    ]
}

struct SubscriptionBillingCycle: Identifiable, Hashable {
    let id: String
    let title: String
    let days: Int

    static let day = SubscriptionBillingCycle(id: "1d", title: "1 day", days: 1)
    static let month = SubscriptionBillingCycle(id: "1m", title: "1 month", days: 30)
    static let threeMonths = SubscriptionBillingCycle(id: "3m", title: "3 months", days: 90)
    static let sixMonths = SubscriptionBillingCycle(id: "6m", title: "6 months", days: 180)
    static let year = SubscriptionBillingCycle(id: "12m", title: "12 months", days: 365)

    var localizedTitle: String {
        "subscription.period.\(id)".localized
    }
}

struct SubscriptionPlanOption: Identifiable, Hashable {
    var id: String { name }
    let name: String
    let cycles: [SubscriptionBillingCycle]
    var maximumSlots: Int? = nil
}

struct SubscriptionDefinition {
    let serviceName: String
    let plans: [SubscriptionPlanOption]

    func plan(named value: String?) -> SubscriptionPlanOption {
        plans.first(where: { $0.name == value }) ?? plans[0]
    }
}

enum SubscriptionCatalog {
    static let definitions: [SubscriptionDefinition] = [
        SubscriptionDefinition(serviceName: "Twitch", plans: [
            .init(name: "Tier 1", cycles: [.month, .threeMonths, .sixMonths]),
            .init(name: "Tier 2", cycles: [.month, .threeMonths, .sixMonths]),
            .init(name: "Tier 3", cycles: [.month, .threeMonths, .sixMonths])
        ]),
        SubscriptionDefinition(serviceName: "YouTube Premium", plans: [
            .init(name: "Individual", cycles: [.month, .year]),
            .init(name: "Two-person", cycles: [.month], maximumSlots: 2),
            .init(name: "Family", cycles: [.month], maximumSlots: 6),
            .init(name: "Student", cycles: [.month]),
            .init(name: "Premium Lite", cycles: [.month])
        ]),
        SubscriptionDefinition(serviceName: "Discord", plans: [
            .init(name: "Nitro Basic", cycles: [.month, .year]),
            .init(name: "Nitro", cycles: [.month, .year])
        ]),
        SubscriptionDefinition(serviceName: "Xbox Game Pass", plans: [
            .init(name: "Essential", cycles: [.month, .threeMonths, .year]),
            .init(name: "Premium", cycles: [.month, .threeMonths, .year]),
            .init(name: "Ultimate", cycles: [.month, .threeMonths, .year]),
            .init(name: "PC Game Pass", cycles: [.month, .threeMonths])
        ]),
        SubscriptionDefinition(serviceName: "PlayStation Plus", plans: [
            .init(name: "Essential", cycles: [.month, .threeMonths, .year]),
            .init(name: "Extra", cycles: [.month, .threeMonths, .year]),
            .init(name: "Premium", cycles: [.month, .threeMonths, .year])
        ]),
        SubscriptionDefinition(serviceName: "Nintendo Switch Online", plans: [
            .init(name: "Individual", cycles: [.month, .threeMonths, .year]),
            .init(name: "Family", cycles: [.year], maximumSlots: 8),
            .init(name: "Individual + Expansion Pack", cycles: [.year]),
            .init(name: "Family + Expansion Pack", cycles: [.year], maximumSlots: 8)
        ]),
        SubscriptionDefinition(serviceName: "EA Play", plans: [
            .init(name: "EA Play", cycles: [.month, .year]),
            .init(name: "EA Play Pro", cycles: [.month, .year])
        ]),
        SubscriptionDefinition(serviceName: "Ubisoft+", plans: [
            .init(name: "Classics", cycles: [.month]),
            .init(name: "Premium", cycles: [.month])
        ]),
        SubscriptionDefinition(serviceName: "GeForce Now", plans: [
            .init(name: "Performance", cycles: [.month, .sixMonths]),
            .init(name: "Ultimate", cycles: [.month, .sixMonths]),
            .init(name: "Performance Day Pass", cycles: [.day]),
            .init(name: "Ultimate Day Pass", cycles: [.day])
        ])
    ]

    static func definition(named name: String) -> SubscriptionDefinition? {
        let normalized = name.lowercased()
        if normalized.contains("youtube") { return definitions.first { $0.serviceName == "YouTube Premium" } }
        return definitions.first { $0.serviceName.lowercased() == normalized }
    }
}

// MARK: - Card Design

enum ProfileCardDesign: String, CaseIterable, Codable, Identifiable {
    case classic
    case cartridge
    case console
    case arcade
    case neon
    case cosmos

    var id: String { rawValue }

    var localizedName: String { "profile.card.design.\(rawValue)".localized }

    var assetName: String { "CardDesign-\(rawValue)" }

    var icon: String {
        switch self {
        case .classic: return "rectangle.fill"
        case .cartridge: return "externaldrive.fill"
        case .console: return "gamecontroller.fill"
        case .arcade: return "dpad.fill"
        case .neon: return "bolt.fill"
        case .cosmos: return "sparkles"
        }
    }
}

// MARK: - ProfileCard

struct ProfileCard: Identifiable {
    var id: String { userId }
    var username: String
    var subtitle: String
    var platform: Platform?
    var platforms: [Platform]
    var tags: [GameTag]
    var wantedGames: [String]
    var wantedGameTags: [GameTag]
    var platformGames: [String: [String]]
    var platformGameTags: [String: [GameTag]]   // platform rawValue → GameTag (with coverUrl)
    var userId: String
    var avatarUrl: String?
    var subscriptions: [LocalUserSubscription]
    var skills: [String]
    var skillsDescription: String?
    var skillsPortfolioUrls: [String]
    var status: String?
    var rating: Double
    var cardDesign: ProfileCardDesign
    var matchingOwnedGames: Set<String>

    init(
        username: String,
        subtitle: String = "",
        platform: Platform? = nil,
        platforms: [Platform] = [],
        tags: [GameTag] = [],
        wantedGames: [String] = [],
        wantedGameTags: [GameTag] = [],
        platformGames: [String: [String]] = [:],
        platformGameTags: [String: [GameTag]] = [:],
        userId: String,
        avatarUrl: String? = nil,
        subscriptions: [LocalUserSubscription] = [],
        skills: [String] = [],
        skillsDescription: String? = nil,
        skillsPortfolioUrls: [String] = [],
        status: String? = nil,
        rating: Double = 0.0,
        cardDesign: ProfileCardDesign = .classic,
        matchingOwnedGames: Set<String> = []
    ) {
        self.username = username
        self.subtitle = subtitle
        self.platform = platform
        self.platforms = platforms
        self.tags = tags
        self.wantedGames = wantedGames
        self.wantedGameTags = wantedGameTags
        self.platformGames = platformGames
        self.platformGameTags = platformGameTags
        self.userId = userId
        self.avatarUrl = avatarUrl
        self.subscriptions = subscriptions
        self.skills = skills
        self.skillsDescription = skillsDescription
        self.skillsPortfolioUrls = skillsPortfolioUrls
        self.status = status
        self.rating = rating
        self.cardDesign = cardDesign
        self.matchingOwnedGames = matchingOwnedGames
    }
}

extension ProfileCard {
    static func from(_ profile: UserProfile) -> ProfileCard {
        let platforms = profile.platforms.compactMap(Platform.init(rawValue:))
        let platformTags = profile.platformGames.mapValues { names in
            names.map { GameTag(name: $0) }
        }
        return ProfileCard(
            username: profile.username,
            subtitle: profile.status ?? "",
            platform: platforms.first,
            platforms: platforms,
            tags: profile.games.map { GameTag(name: $0) },
            wantedGames: profile.wantedGames,
            wantedGameTags: profile.wantedGames.map { GameTag(name: $0) },
            platformGames: profile.platformGames,
            platformGameTags: platformTags,
            userId: profile.uid,
            avatarUrl: profile.avatarUrl,
            subscriptions: profile.subscriptions,
            skills: profile.skills,
            skillsDescription: profile.skillsDescription,
            skillsPortfolioUrls: profile.skillsPortfolioUrls,
            status: profile.status,
            rating: profile.rating,
            cardDesign: profile.cardDesign
        )
    }
}

// MARK: - UserProfile (Firestore document)

struct UserProfile: Codable, Identifiable {
    var id: String { uid }
    var uid: String
    var username: String
    var avatarUrl: String?
    var status: String?
    var games: [String]
    var wantedGames: [String]
    var platforms: [String]
    var platformGames: [String: [String]]   // platform rawValue → game names
    var skills: [String]
    var subscriptions: [LocalUserSubscription]
    var onboardingComplete: Bool
    var hasSkillsProfile: Bool
    var skillsDescription: String?
    var skillsPortfolioUrls: [String]
    var isOnline: Bool
    var lastSeen: Date?
    var rating: Double
    var cardDesign: ProfileCardDesign

    init(uid: String, username: String) {
        self.uid = uid
        self.username = username
        self.games = []
        self.wantedGames = []
        self.platforms = []
        self.platformGames = [:]
        self.skills = []
        self.subscriptions = []
        self.onboardingComplete = false
        self.hasSkillsProfile = false
        self.skillsDescription = nil
        self.skillsPortfolioUrls = []
        self.isOnline = true
        self.rating = 0.0
        self.cardDesign = .classic
    }
}

struct AvatarPreset: Codable, Identifiable, Hashable {
    let id: String
    let category: String
    let imageUrl: String
    let sortOrder: Int
    let licenseName: String
    let attributionUrl: String
    let isOfficial: Bool

    enum CodingKeys: String, CodingKey {
        case id, category
        case imageUrl = "image_url"
        case sortOrder = "sort_order"
        case licenseName = "license_name"
        case attributionUrl = "attribution_url"
        case isOfficial = "is_official"
    }
}
