import Foundation

struct Review: Identifiable, Codable {
    var id: String
    let fromUid: String
    let toUid: String
    let chatId: String?
    let rating: Int      // 1-5
    let reviewText: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, rating
        case fromUid = "from_uid"
        case toUid = "to_uid"
        case chatId = "chat_id"
        case reviewText = "review_text"
        case createdAt = "created_at"
    }
}
