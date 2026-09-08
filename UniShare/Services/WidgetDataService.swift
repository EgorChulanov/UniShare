import Foundation
import UIKit
import WidgetKit

final class WidgetDataService {
    static let shared = WidgetDataService()

    private let defaults = UserDefaults(suiteName: AppConstants.appGroupID)

    private init() {}

    func updateWidgetData(username: String, avatar: UIImage?, unreadCount: Int, likesCount: Int) {
        defaults?.set(username, forKey: AppConstants.WidgetKeys.username)
        defaults?.set(unreadCount, forKey: AppConstants.WidgetKeys.unreadCount)
        defaults?.set(likesCount, forKey: AppConstants.WidgetKeys.likesCount)

        if let avatar, let data = avatar.pngData() {
            defaults?.set(data, forKey: AppConstants.WidgetKeys.avatarData)
        }

        WidgetCenter.shared.reloadAllTimelines()
    }

    func getUsername() -> String? {
        defaults?.string(forKey: AppConstants.WidgetKeys.username)
    }

    func getAvatar() -> UIImage? {
        guard let data = defaults?.data(forKey: AppConstants.WidgetKeys.avatarData) else { return nil }
        return UIImage(data: data)
    }

    func getUnreadCount() -> Int {
        defaults?.integer(forKey: AppConstants.WidgetKeys.unreadCount) ?? 0
    }

    func getLikesCount() -> Int {
        defaults?.integer(forKey: AppConstants.WidgetKeys.likesCount) ?? 0
    }
}
