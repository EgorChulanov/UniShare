import Foundation

enum AppConstants {
    static var isUITesting: Bool {
#if DEBUG
        ProcessInfo.processInfo.environment["UNISHARE_UI_TESTING"] == "1"
#else
        false
#endif
    }

    // MARK: - Bundle IDs
    static var bundleID: String {
        Bundle.main.bundleIdentifier ?? ""
    }

    static var appGroupID: String {
        Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_ID") as? String
            ?? "group.com.egorchulanov.unishare"
    }

    static var widgetBundleID: String {
        "\(bundleID).Widget"
    }

    // MARK: - URL Schemes
    enum DeepLink {
        static let scheme = "unishare"
        static let chats = URL(string: "unishare://chats")!
        static let airShare = URL(string: "unishare://airshare")!
        static let profile = URL(string: "unishare://profile")!
    }

    enum Legal {
        private static let base = "https://kwonpzkzthprilrhncik.supabase.co/functions/v1/legal"

        static func privacyPolicy(language: String) -> URL {
            URL(string: "\(base)/privacy?lang=\(language)")!
        }

        static func terms(language: String) -> URL {
            URL(string: "\(base)/terms?lang=\(language)")!
        }

        static let privacyPolicy = URL(string: "\(base)/privacy")!
        static let terms = URL(string: "\(base)/terms")!
        static let support = URL(string: "mailto:official@egorchulanov.ru")!
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
        static let initialBatchSize = 8
        static let maxUndoPerDay = 3
        static let undoCountKey = "feed_undo_count"
        static let undoDateKey = "feed_undo_date"
    }

    // MARK: - AirShare
    enum AirShare {
        static let serviceType = "unishare-ex"
    }
}
