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
            if !tabState.isTabBarHidden {
                UniShareTabBar(selection: $tabState.selectedTab, avatarURL: avatarURL)
                    .environmentObject(theme)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: tabState.isTabBarHidden)
        .task(id: env.auth.uid) { await refreshAvatar() }
        .onReceive(NotificationCenter.default.publisher(for: .uniShareProfileDidUpdate)) { _ in
            Task { await refreshAvatar() }
        }
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
        HStack(spacing: 6) {
            tabButton(.feed) { CardStackTabIcon(isSelected: selection == .feed) }
            tabButton(.chats) {
                Image(systemName: selection == .chats ? "message.fill" : "message")
                    .font(.system(size: 21, weight: .semibold))
            }
            tabButton(.profile) {
                AvatarView(url: avatarURL, size: 25, showBorder: selection == .profile)
                    .environmentObject(theme)
            }
        }
        .padding(7)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 27, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 27, style: .continuous)
                .stroke(
                    LinearGradient(
                        colors: [.white.opacity(0.30), .white.opacity(0.06)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 0.8
                )
        }
        .shadow(color: .black.opacity(0.22), radius: 22, y: 10)
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 8)
    }

    private func tabButton<Icon: View>(_ tab: AppTab, @ViewBuilder icon: () -> Icon) -> some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) { selection = tab }
            HapticsManager.shared.impact(.light)
        } label: {
            VStack(spacing: 3) {
                icon()
                    .foregroundStyle(selection == tab ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                    .frame(height: 27)

                Text(accessibilityTitle(for: tab))
                    .font(.system(size: 10, weight: selection == tab ? .bold : .semibold))
                    .foregroundStyle(selection == tab ? theme.effectiveTextColor : theme.effectiveSecondaryTextColor)
                    .lineLimit(1)
            }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(
                    selection == tab ? theme.effectivePrimary.opacity(0.16) : .clear,
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                )
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
                .fill(isSelected ? Color.primary.opacity(0.18) : Color.primary.opacity(0.10))
                .overlay(RoundedRectangle(cornerRadius: 3.5).strokeBorder(lineWidth: 1.5))
                .frame(width: 17, height: 21)
                .rotationEffect(.degrees(-11))
                .offset(x: -3)
            RoundedRectangle(cornerRadius: 3.5)
                .fill(isSelected ? Color.accentColor : Color.primary.opacity(0.32))
                .overlay(RoundedRectangle(cornerRadius: 3.5).strokeBorder(lineWidth: 1.7))
                .frame(width: 17, height: 21)
                .rotationEffect(.degrees(8))
                .offset(x: 4)
        }
        .frame(width: 28, height: 28)
    }
}
