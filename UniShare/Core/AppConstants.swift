import Foundation

enum AppConstants {
    // MARK: - Bundle IDs
    static let bundleID = "com.CHULANOV.UniShare"
    static let appGroupID = "group.com.CHULANOV.UniShare"
    static let widgetBundleID = "com.CHULANOV.UniShare.UniShareWidget"

    // MARK: - URL Schemes
    enum DeepLink {
        static let scheme = "unishare"
        static let chats = URL(string: "unishare://chats")!
        static let airShare = URL(string: "unishare://airshare")!
        static let ai = URL(string: "unishare://ai")!
        static let profile = URL(string: "unishare://profile")!
    }

    // MARK: - App Group Keys
    enum WidgetKeys {
        static let username = "widget_username"
        static let avatarData = "widget_avatarData"
        static let unreadCount = "widget_unreadCount"
        static let likesCount = "widget_likesCount"
    }

    // MARK: - Feed
    enum Feed {
        static let initialBatchSize = 3
        static let maxUndoPerDay = 3
        static let undoCountKey = "feed_undo_count"
        static let undoDateKey = "feed_undo_date"
    }

    // MARK: - AI
    enum AI {
        static let maxMessageLength = 100
        static let maxTokens = 200
        static let model = "gpt-4o-mini"
        static let eastEggTapCount = 10
    }

    // MARK: - AirShare
    enum AirShare {
        static let serviceType = "unishare-ex"
        static let shakeThreshold: Double = 2.5
    }
}
