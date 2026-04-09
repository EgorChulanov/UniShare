import Foundation
import SwiftUI

enum AppTab: Int {
    case feed = 0
    case chats = 1
    case ai = 2
    case profile = 3
}

final class TabBarState: ObservableObject {
    static let shared = TabBarState()

    @Published var selectedTab: AppTab = .feed
    @Published var showAirShare = false

    private init() {}

    func switchTo(_ tab: AppTab) {
        selectedTab = tab
    }

    func handleDeepLink(_ url: URL) {
        guard url.scheme == AppConstants.DeepLink.scheme else { return }
        switch url.host {
        case "chats":
            selectedTab = .chats
        case "airshare":
            selectedTab = .feed
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                self.showAirShare = true
            }
        case "ai":
            selectedTab = .ai
        case "profile":
            selectedTab = .profile
        default:
            break
        }
    }
}
