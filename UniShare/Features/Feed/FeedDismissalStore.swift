import Foundation

struct FeedDismissalStore {
    static let retentionInterval: TimeInterval = 24 * 60 * 60

    private let defaults: UserDefaults
    private let storageKey: String

    init(defaults: UserDefaults = .standard, storageKey: String = "feed.dismissals.v1") {
        self.defaults = defaults
        self.storageKey = storageKey
    }

    func contains(userID: String, context: String, now: Date = Date()) -> Bool {
        guard let timestamp = activeEntries(now: now)[entryKey(userID: userID, context: context)] else {
            return false
        }
        return now.timeIntervalSince1970 - timestamp < Self.retentionInterval
    }

    func record(userID: String, context: String, now: Date = Date()) {
        var entries = activeEntries(now: now)
        entries[entryKey(userID: userID, context: context)] = now.timeIntervalSince1970
        save(entries)
    }

    func remove(userID: String, context: String, now: Date = Date()) {
        var entries = activeEntries(now: now)
        entries.removeValue(forKey: entryKey(userID: userID, context: context))
        save(entries)
    }

    private func activeEntries(now: Date) -> [String: TimeInterval] {
        let decoded = defaults.dictionary(forKey: storageKey) as? [String: TimeInterval] ?? [:]
        let cutoff = now.timeIntervalSince1970 - Self.retentionInterval
        let active = decoded.filter { $0.value > cutoff }
        if active.count != decoded.count { save(active) }
        return active
    }

    private func save(_ entries: [String: TimeInterval]) {
        defaults.set(entries, forKey: storageKey)
    }

    private func entryKey(userID: String, context: String) -> String {
        "\(context)|\(userID)"
    }
}
