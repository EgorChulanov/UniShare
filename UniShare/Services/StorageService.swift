import Foundation
import FirebaseStorage
import UIKit

final class StorageService {
    private let storage = Storage.storage()

    func uploadAvatar(_ image: UIImage, uid: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.6) else {
            throw StorageError.compressionFailed
        }
        let ref = storage.reference().child("avatars/\(uid).jpg")
        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"
        _ = try await ref.putDataAsync(data, metadata: metadata)
        let url = try await ref.downloadURL()
        return url.absoluteString
    }

    func uploadChatImage(_ image: UIImage, chatId: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.7) else {
            throw StorageError.compressionFailed
        }
        let fileName = "\(UUID().uuidString).jpg"
        let ref = storage.reference().child("chats/\(chatId)/\(fileName)")
        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"
        _ = try await ref.putDataAsync(data, metadata: metadata)
        let url = try await ref.downloadURL()
        return url.absoluteString
    }

    func downloadImage(url: String) async throws -> UIImage {
        guard let parsedUrl = URL(string: url) else { throw StorageError.invalidURL }
        let ref = storage.reference(forURL: url)
        let data = try await ref.data(maxSize: 10 * 1024 * 1024)
        guard let image = UIImage(data: data) else { throw StorageError.decodingFailed }
        return image
    }

    enum StorageError: LocalizedError {
        case compressionFailed
        case invalidURL
        case decodingFailed

        var errorDescription: String? {
            switch self {
            case .compressionFailed: return "Failed to compress image"
            case .invalidURL: return "Invalid storage URL"
            case .decodingFailed: return "Failed to decode image data"
            }
        }
    }
}
