import WidgetKit
import AppIntents
import SwiftUI

// MARK: - Intents

@available(iOS 18.0, *)
struct OpenChatsIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Chats"

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "unishare://chats")!))
    }

    static var openAppWhenRun: Bool = true
}

@available(iOS 18.0, *)
struct OpenAirShareIntent: AppIntent {
    static var title: LocalizedStringResource = "Open AirShare"

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "unishare://airshare")!))
    }

    static var openAppWhenRun: Bool = true
}

@available(iOS 18.0, *)
struct OpenProfileIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Profile"

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "unishare://profile")!))
    }

    static var openAppWhenRun: Bool = true
}

// MARK: - Control Widgets

@available(iOS 18.0, *)
struct UniShareChatsControl: ControlWidget {
    static var kind: String = "UniShareChatsControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenChatsIntent()) {
                Label("Chats", systemImage: "message.fill")
            }
        }
        .displayName("UniShare Chats")
        .description("Open UniShare chats")
    }
}

@available(iOS 18.0, *)
struct UniShareAirShareControl: ControlWidget {
    static var kind: String = "UniShareAirShareControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenAirShareIntent()) {
                Label("AirShare", systemImage: "wave.3.forward")
            }
        }
        .displayName("AirShare")
        .description("Open AirShare to find nearby gamers")
    }
}

@available(iOS 18.0, *)
struct UniShareProfileControl: ControlWidget {
    static var kind: String = "UniShareProfileControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenProfileIntent()) {
                Label("Profile", systemImage: "person.crop.circle.fill")
            }
        }
        .displayName("UniShare Profile")
        .description("Open your profile")
    }
}
