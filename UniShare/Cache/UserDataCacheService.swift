import Foundation

struct CachedUserData {
    let username: String
    let avatarUrl: String?
}

final class UserDataCacheService {
    static let shared = UserDataCacheService()

    private var cache: [String: CachedUserData] = [:]
    private let lock = NSLock()

    private init() {}

    func store(_ data: CachedUserData, for uid: String) {
        lock.withLock { cache[uid] = data }
    }

    func get(for uid: String) -> CachedUserData? {
        lock.withLock { cache[uid] }
    }

    func clear() {
        lock.withLock { cache.removeAll() }
    }
}

actor ChatMessageCacheService {
    static let shared = ChatMessageCacheService()

    private let fileManager = FileManager.default
    private let directory: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        let root = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        directory = root.appendingPathComponent("UniShareMessages", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func messages(for chatID: String) -> [Message] {
        guard let data = try? Data(contentsOf: fileURL(chatID)),
              let messages = try? decoder.decode([Message].self, from: data) else { return [] }
        return messages
    }

    func store(_ messages: [Message], for chatID: String) {
        guard let data = try? encoder.encode(messages) else { return }
        try? data.write(to: fileURL(chatID), options: .atomic)
    }

    func clear() throws {
        if fileManager.fileExists(atPath: directory.path) { try fileManager.removeItem(at: directory) }
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func size() -> Int64 {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        return files.reduce(0) { $0 + Int64((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }

    private func fileURL(_ chatID: String) -> URL {
        let safe = chatID.replacingOccurrences(of: "/", with: "_")
        return directory.appendingPathComponent(safe).appendingPathExtension("json")
    }
}

enum UniShareCacheController {
    static func size() async -> Int64 {
        let media = await PersistentMediaCache.shared.size()
        let messages = await ChatMessageCacheService.shared.size()
        return media + messages
    }

    static func clear() async throws {
        AvatarCacheService.shared.clearCache()
        GameIconCacheService.shared.clearCache()
        UserDataCacheService.shared.clear()
        UserDefaults.standard.dictionaryRepresentation().keys
            .filter { $0.hasPrefix("rawg.cache.") }
            .forEach { UserDefaults.standard.removeObject(forKey: $0) }
        try await PersistentMediaCache.shared.clear()
        try await ChatMessageCacheService.shared.clear()
        URLCache.shared.removeAllCachedResponses()
    }
}
