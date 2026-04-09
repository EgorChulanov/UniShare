import Foundation
import ActivityKit
import SwiftUI

// MARK: - Live Activity Attributes

struct UniShareLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var message: String
        var emoji: String
    }
    var username: String
}

// MARK: - Service

final class DynamicIslandService {
    static let shared = DynamicIslandService()
    private var activity: Activity<UniShareLiveActivityAttributes>?

    private init() {}

    func startEasterEgg(username: String) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let attributes = UniShareLiveActivityAttributes(username: username)
        let state = UniShareLiveActivityAttributes.ContentState(
            message: "AI is thinking...",
            emoji: "🎮"
        )

        do {
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(30))
            activity = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
        } catch {
            print("Live Activity failed: \(error)")
        }
    }

    func updateActivity(message: String, emoji: String = "✨") {
        guard let activity else { return }
        let state = UniShareLiveActivityAttributes.ContentState(message: message, emoji: emoji)
        Task {
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(30))
            await activity.update(content)
        }
    }

    func stopEasterEgg() {
        guard let activity else { return }
        Task {
            let state = UniShareLiveActivityAttributes.ContentState(message: "Done!", emoji: "🎉")
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(3)))
            self.activity = nil
        }
    }
}
