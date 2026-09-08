import UIKit
import Combine
import CryptoKit

actor PersistentMediaCache {
    static let shared = PersistentMediaCache()

    private let memory = NSCache<NSString, UIImage>()
    private let fileManager = FileManager.default
    private let directory: URL

    private init() {
        memory.countLimit = 320
        let root = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        directory = root.appendingPathComponent("UniShareMedia", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func image(for key: String) async -> UIImage? {
        if let image = memory.object(forKey: key as NSString) { return image }
        let file = fileURL(for: key)
        guard let data = try? Data(contentsOf: file), let image = UIImage(data: data) else { return nil }
        memory.setObject(image, forKey: key as NSString)
        try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
        return image
    }

    func load(from urlString: String) async -> UIImage? {
        if let cached = await image(for: urlString) { return cached }
        guard let url = URL(string: urlString), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            return nil
        }
        do {
            let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 20)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode ?? 200 < 400,
                  let image = UIImage(data: data) else { return nil }
            await store(image, data: data, for: urlString)
            return image
        } catch {
            return nil
        }
    }

    func store(_ image: UIImage, for key: String) async {
        await store(image, data: image.jpegData(compressionQuality: 0.9), for: key)
    }

    func clear() throws {
        memory.removeAllObjects()
        if fileManager.fileExists(atPath: directory.path) {
            try fileManager.removeItem(at: directory)
        }
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func size() -> Int64 {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        return files.reduce(0) { total, file in
            total + Int64((try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }

    private func store(_ image: UIImage, data: Data?, for key: String) async {
        memory.setObject(image, forKey: key as NSString)
        guard let data else { return }
        try? data.write(to: fileURL(for: key), options: .atomic)
    }

    private func fileURL(for key: String) -> URL {
        let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(digest).appendingPathExtension("image")
    }
}

final class AvatarCacheService: ObservableObject {
    static let shared = AvatarCacheService()

    private let cache = NSCache<NSString, UIImage>()
    @Published var cachedAvatar: UIImage?

    private init() {
        cache.countLimit = 100
    }

    func image(for url: String) -> UIImage? {
        cache.object(forKey: url as NSString)
    }

    func store(_ image: UIImage, for url: String) {
        cache.setObject(image, forKey: url as NSString)
        Task { await PersistentMediaCache.shared.store(image, for: url) }
    }

    func loadImage(from urlString: String) async -> UIImage? {
        if let cached = cache.object(forKey: urlString as NSString) {
            return cached
        }
        if let image = await PersistentMediaCache.shared.load(from: urlString) {
            cache.setObject(image, forKey: urlString as NSString)
            return image
        }
        return nil
    }

    func loadUserAvatar(from urlString: String?) async {
        guard let urlString, !urlString.isEmpty else {
            await MainActor.run { cachedAvatar = nil }
            return
        }
        if let image = await loadImage(from: urlString) {
            await MainActor.run { cachedAvatar = image }
        }
    }

    func clearCache() {
        cache.removeAllObjects()
        cachedAvatar = nil
    }
}
