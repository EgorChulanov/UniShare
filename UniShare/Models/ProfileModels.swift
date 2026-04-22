import Foundation
import SwiftUI

// MARK: - Platform

enum Platform: String, CaseIterable, Codable {
    case nintendo = "Nintendo"
    case playstation = "PlayStation"
    case xbox = "Xbox"
    case pc = "PC"
    case mobile = "Mobile"

    var icon: String {
        switch self {
        case .nintendo: return "gamecontroller.fill"
        case .playstation: return "playstation.logo"
        case .xbox: return "xbox.logo"
        case .pc: return "desktopcomputer"
        case .mobile: return "iphone"
        }
    }

    var color: Color {
        switch self {
        case .nintendo: return Color(hex: "#E60012")
        case .playstation: return Color(hex: "#003791")
        case .xbox: return Color(hex: "#107C10")
        case .pc: return Color(hex: "#0078D4")
        case .mobile: return Color(hex: "#4A148C")
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

    static let available: [LocalUserSubscription] = [
        LocalUserSubscription(name: "Twitch", url: nil, iconName: "video.fill"),
        LocalUserSubscription(name: "YouTube Gaming", url: nil, iconName: "play.rectangle.fill"),
        LocalUserSubscription(name: "Discord", url: nil, iconName: "bubble.left.fill"),
        LocalUserSubscription(name: "Steam", url: nil, iconName: "gamecontroller"),
        LocalUserSubscription(name: "Xbox Game Pass", url: nil, iconName: "xbox.logo"),
        LocalUserSubscription(name: "PlayStation Plus", url: nil, iconName: "playstation.logo"),
        LocalUserSubscription(name: "Nintendo Switch Online", url: nil, iconName: "gamecontroller.fill"),
        LocalUserSubscription(name: "EA Play", url: nil, iconName: "sportscourt"),
        LocalUserSubscription(name: "Ubisoft+", url: nil, iconName: "u.circle"),
        LocalUserSubscription(name: "GeForce Now", url: nil, iconName: "bolt.fill")
    ]
}

// MARK: - ProfileCard

struct ProfileCard: Identifiable {
    var id: String { userId }
    var username: String
    var subtitle: String
    var platform: Platform?
    var platforms: [Platform]
    var tags: [GameTag]
    var platformGames: [String: [String]]
    var platformGameTags: [String: [GameTag]]   // platform rawValue → GameTag (with coverUrl)
    var userId: String
    var avatarUrl: String?
    var subscriptions: [LocalUserSubscription]
    var skills: [String]
    var status: String?
    var rating: Double

    init(
        username: String,
        subtitle: String = "",
        platform: Platform? = nil,
        platforms: [Platform] = [],
        tags: [GameTag] = [],
        platformGames: [String: [String]] = [:],
        platformGameTags: [String: [GameTag]] = [:],
        userId: String,
        avatarUrl: String? = nil,
        subscriptions: [LocalUserSubscription] = [],
        skills: [String] = [],
        status: String? = nil,
        rating: Double = 0.0
    ) {
        self.username = username
        self.subtitle = subtitle
        self.platform = platform
        self.platforms = platforms
        self.tags = tags
        self.platformGames = platformGames
        self.platformGameTags = platformGameTags
        self.userId = userId
        self.avatarUrl = avatarUrl
        self.subscriptions = subscriptions
        self.skills = skills
        self.status = status
        self.rating = rating
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
    var isOnline: Bool
    var lastSeen: Date?
    var rating: Double

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
        self.isOnline = true
        self.rating = 0.0
    }
}
