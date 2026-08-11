import Foundation
import Supabase
import UIKit

final class SupabaseStorageService {
    private let client = SupabaseManager.shared.client

    func uploadAvatar(_ image: UIImage, uid: String) async throws -> String {
        guard let data = image.preparingForUpload(maxDimension: 1_024, quality: 0.72) else {
            throw StorageError.compressionFailed
        }
        let path = "\(uid)/avatar.jpg"
        do {
            _ = try await client.storage
                .from("avatars")
                .upload(path, data: data, options: FileOptions(contentType: "image/jpeg", upsert: true))
            let url = try client.storage.from("avatars").getPublicURL(path: path)
            return url.absoluteString
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("row-level security") || message.contains("policy") {
                throw StorageError.avatarPolicyMissing
            }
            throw error
        }
    }

    func uploadChatImage(_ image: UIImage, chatId: String) async throws -> String {
        guard let data = image.preparingForUpload(maxDimension: 2_048, quality: 0.75) else {
            throw StorageError.compressionFailed
        }
        let fileName = "\(UUID().uuidString).jpg"
        let path = "\(chatId)/\(fileName)"
        _ = try await client.storage
            .from("chats")
            .upload(path, data: data, options: FileOptions(contentType: "image/jpeg", upsert: false))
        return path
    }

    func signedChatImageURL(path: String) async throws -> String {
        let url = try await client.storage
            .from("chats")
            .createSignedURL(path: path, expiresIn: 3_600)
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
        case avatarPolicyMissing

        var errorDescription: String? {
            switch self {
            case .compressionFailed: return "Failed to compress image"
            case .invalidURL: return "Invalid storage URL"
            case .decodingFailed: return "Failed to decode image data"
            case .avatarPolicyMissing: return "profile.error.avatar.policy".localized
            }
        }
    }
}

private extension UIImage {
    func preparingForUpload(maxDimension: CGFloat, quality: CGFloat) -> Data? {
        let longestSide = max(size.width, size.height)
        guard longestSide > 0 else { return nil }
        guard longestSide > maxDimension else { return jpegData(compressionQuality: quality) }

        let scale = maxDimension / longestSide
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: targetSize))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}
