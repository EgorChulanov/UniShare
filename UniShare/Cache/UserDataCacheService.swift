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
