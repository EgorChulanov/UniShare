import SwiftUI

extension Notification.Name {
    static let uniShareProfileDidUpdate = Notification.Name("UniShare.profileDidUpdate")
}

struct TabBarView: View {
    @StateObject private var tabState = TabBarState.shared
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var theme: ThemeManager
    @State private var avatarURL: String?

    var body: some View {
        ZStack {
            switch tabState.selectedTab {
            case .feed: FeedView()
            case .chats: ChatsView()
            case .profile: ProfileView()
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            UniShareTabBar(selection: $tabState.selectedTab, avatarURL: avatarURL)
                .environmentObject(theme)
        }
        .task(id: env.auth.uid) { await refreshAvatar() }
        .onReceive(NotificationCenter.default.publisher(for: .uniShareProfileDidUpdate)) { _ in
            Task { await refreshAvatar() }
        }
        .onAppear { ShakeDetectionService.shared.start() }
        .sheet(isPresented: $tabState.showAirShare) { AirShareView() }
    }

    private func refreshAvatar() async {
        guard let uid = env.auth.uid else {
            avatarURL = nil
            return
        }
        avatarURL = try? await env.db.getUser(uid: uid)?.avatarUrl
    }
}

private struct UniShareTabBar: View {
    @Binding var selection: AppTab
    let avatarURL: String?
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        HStack(spacing: 10) {
            tabButton(.feed) { CardStackTabIcon(isSelected: selection == .feed) }
            tabButton(.chats) {
                Image(systemName: selection == .chats ? "message.fill" : "message")
                    .font(.system(size: 20, weight: .semibold))
            }
            tabButton(.profile) {
                AvatarView(url: avatarURL, size: 28, showBorder: selection == .profile)
                    .environmentObject(theme)
            }
        }
        .padding(6)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.16), lineWidth: 0.75))
        .shadow(color: .black.opacity(0.14), radius: 18, y: 8)
        .padding(.horizontal, 54)
        .padding(.top, 6)
        .padding(.bottom, 7)
    }

    private func tabButton<Icon: View>(_ tab: AppTab, @ViewBuilder icon: () -> Icon) -> some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) { selection = tab }
            HapticsManager.shared.impact(.light)
        } label: {
            icon()
                .foregroundStyle(selection == tab ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(selection == tab ? theme.effectivePrimary.opacity(0.12) : .clear, in: Capsule())
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier(for: tab))
        .accessibilityLabel(accessibilityTitle(for: tab))
        .accessibilityAddTraits(selection == tab ? .isSelected : [])
    }

    private func identifier(for tab: AppTab) -> String {
        switch tab {
        case .feed: return "tab.feed"
        case .chats: return "tab.chats"
        case .profile: return "tab.profile"
        }
    }

    private func accessibilityTitle(for tab: AppTab) -> String {
        switch tab {
        case .feed: return "tab.feed".localized
        case .chats: return "tab.chats".localized
        case .profile: return "tab.profile".localized
        }
    }
}

private struct CardStackTabIcon: View {
    let isSelected: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3.5)
                .fill(isSelected ? Color.primary.opacity(0.14) : Color.primary.opacity(0.22))
                .overlay(RoundedRectangle(cornerRadius: 3.5).strokeBorder(lineWidth: 1.5))
                .frame(width: 17, height: 21)
                .rotationEffect(.degrees(-11))
                .offset(x: -3)
            RoundedRectangle(cornerRadius: 3.5)
                .fill(isSelected ? Color.accentColor : Color.primary.opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: 3.5).strokeBorder(lineWidth: 1.7))
                .frame(width: 17, height: 21)
                .rotationEffect(.degrees(8))
                .offset(x: 4)
        }
        .frame(width: 28, height: 28)
    }
}
