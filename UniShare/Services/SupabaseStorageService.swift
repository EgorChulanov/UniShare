import Foundation
import Supabase
import UIKit

final class SupabaseStorageService {
    private let client = SupabaseManager.shared.client

    func uploadAvatar(_ image: UIImage, uid: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.6) else {
            throw StorageError.compressionFailed
        }
        let path = "\(uid).jpg"
        _ = try await client.storage
            .from("avatars")
            .upload(
                path: path,
                file: data,
                options: FileOptions(contentType: "image/jpeg", upsert: true)
            )
        let url = try client.storage
            .from("avatars")
            .getPublicURL(path: path)
        return url.absoluteString
    }

    func uploadChatImage(_ image: UIImage, chatId: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.7) else {
            throw StorageError.compressionFailed
        }
        let fileName = "\(UUID().uuidString).jpg"
        let path = "\(chatId)/\(fileName)"
        _ = try await client.storage
            .from("chats")
            .upload(
                path: path,
                file: data,
                options: FileOptions(contentType: "image/jpeg", upsert: false)
            )
        let url = try client.storage
            .from("chats")
            .getPublicURL(path: path)
        return url.absoluteString
    }

    func downloadImage(url: String) async throws -> UIImage {
        guard let parsedUrl = URL(string: url) else {
            throw StorageError.invalidURL
        }
        let (data, _) = try await URLSession.shared.data(from: parsedUrl)
        guard let image = UIImage(data: data) else {
            throw StorageError.decodingFailed
        }
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
