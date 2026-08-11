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
    var isSeen: Bool
}
