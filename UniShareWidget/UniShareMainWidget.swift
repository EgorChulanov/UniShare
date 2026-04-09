import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct UniShareEntry: TimelineEntry {
    var date: Date
    var username: String
    var avatarData: Data?
    var unreadCount: Int
    var likesCount: Int

    static let placeholder = UniShareEntry(
        date: Date(),
        username: "Gamer",
        avatarData: nil,
        unreadCount: 3,
        likesCount: 7
    )
}

// MARK: - Provider

struct UniShareProvider: TimelineProvider {
    private let defaults = UserDefaults(suiteName: "group.com.CHULANOV.UniShare")

    func placeholder(in context: Context) -> UniShareEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (UniShareEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UniShareEntry>) -> Void) {
        let entry = loadEntry()
        let refresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func loadEntry() -> UniShareEntry {
        UniShareEntry(
            date: Date(),
            username: defaults?.string(forKey: "widget_username") ?? "Gamer",
            avatarData: defaults?.data(forKey: "widget_avatarData"),
            unreadCount: defaults?.integer(forKey: "widget_unreadCount") ?? 0,
            likesCount: defaults?.integer(forKey: "widget_likesCount") ?? 0
        )
    }
}

// MARK: - Widget View

struct UniShareWidgetView: View {
    var entry: UniShareEntry
    @Environment(\.widgetFamily) var family

    private let primary = Color(red: 0.914, green: 0.271, blue: 0.376)
    private let background = Color(red: 0.102, green: 0.102, blue: 0.180)
    private let secondary = Color(red: 0.290, green: 0.063, blue: 0.549)

    var body: some View {
        ZStack {
            background

            switch family {
            case .systemSmall:
                smallWidget
            case .systemMedium:
                mediumWidget
            default:
                smallWidget
            }
        }
    }

    // MARK: Small Widget

    private var smallWidget: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Avatar
            avatarView
                .frame(width: 44, height: 44)

            Spacer()

            VStack(alignment: .leading, spacing: 4) {
                Text(entry.username)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 10) {
                    statView(icon: "heart.fill", count: entry.likesCount, color: primary)
                    statView(icon: "message.fill", count: entry.unreadCount, color: .white)
                }
            }
        }
        .padding(14)
    }

    // MARK: Medium Widget

    private var mediumWidget: some View {
        HStack(spacing: 16) {
            // Left: avatar + name
            VStack(alignment: .leading, spacing: 8) {
                avatarView.frame(width: 56, height: 56)
                Text(entry.username)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Spacer()
            }

            Divider().background(Color.white.opacity(0.2))

            // Right: stats + quick links
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 20) {
                    statColumn(icon: "heart.fill", count: entry.likesCount, label: "Likes", color: primary)
                    statColumn(icon: "message.fill", count: entry.unreadCount, label: "Chats", color: secondary)
                }
                Spacer()
                Link(destination: URL(string: "unishare://chats")!) {
                    Text("Open Chats →")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(primary)
                }
            }
        }
        .padding(16)
    }

    // MARK: Helpers

    private var avatarView: some View {
        Group {
            if let data = entry.avatarData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage).resizable().scaledToFill()
            } else {
                ZStack {
                    secondary
                    Image(systemName: "person.fill")
                        .foregroundColor(.white.opacity(0.7))
                        .font(.system(size: 20))
                }
            }
        }
        .clipShape(Circle())
        .overlay(Circle().stroke(primary, lineWidth: 2))
    }

    private func statView(icon: String, count: Int, color: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 10)).foregroundColor(color)
            Text("\(count)").font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
        }
    }

    private func statColumn(icon: String, count: Int, label: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Image(systemName: icon).foregroundColor(color).font(.system(size: 16))
            Text("\(count)").font(.system(size: 20, weight: .bold)).foregroundColor(.white)
            Text(label).font(.system(size: 11)).foregroundColor(.white.opacity(0.6))
        }
    }
}

// MARK: - Widget Definition

@main
struct UniShareMainWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "UniShareMainWidget", provider: UniShareProvider()) { entry in
            UniShareWidgetView(entry: entry)
                .containerBackground(Color(red: 0.102, green: 0.102, blue: 0.180), for: .widget)
        }
        .configurationDisplayName("UniShare")
        .description("Your gaming profile at a glance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
