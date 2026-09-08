import Foundation

struct CommunityStory: Identifiable, Hashable {
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
    let slides: [CommunityStorySlide]
    var isSeen: Bool
}

struct CommunityStorySlide: Codable, Hashable, Identifiable {
    var id: String { "\(title)|\(imageUrl ?? "")" }
    let title: String
    let subtitle: String
    let body: String
    let imageUrl: String?
    let symbol: String

    enum CodingKeys: String, CodingKey {
        case title, subtitle, body, symbol
        case imageUrl = "image_url"
    }
}
