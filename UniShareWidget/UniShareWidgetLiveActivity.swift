import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Live Activity Attributes (matches DynamicIslandService)

struct UniShareLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var message: String
        var emoji: String
    }
    var username: String
}

// MARK: - Live Activity Widget

struct UniShareWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: UniShareLiveActivityAttributes.self) { context in
            // Lock screen / banner
            HStack {
                Text(context.attributes.username)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                Spacer()
                Text(context.state.emoji)
                    .font(.system(size: 20))
                Text(context.state.message)
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.8))
            }
            .padding(16)
            .background(Color(red: 0.102, green: 0.102, blue: 0.180))

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.username)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.emoji)
                        .font(.system(size: 20))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.message)
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.8))
                }
            } compactLeading: {
                Image(systemName: "sparkles")
                    .foregroundColor(Color(red: 0.914, green: 0.271, blue: 0.376))
                    .font(.system(size: 12))
            } compactTrailing: {
                Text(context.state.emoji)
                    .font(.system(size: 12))
            } minimal: {
                Image(systemName: "sparkles")
                    .foregroundColor(Color(red: 0.914, green: 0.271, blue: 0.376))
                    .font(.system(size: 10))
            }
        }
    }
}
