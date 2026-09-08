import SwiftUI
import UIKit

extension Notification.Name {
    static let uniShareProfileDidUpdate = Notification.Name("UniShare.profileDidUpdate")
}

struct TabBarView: View {
    @StateObject private var tabState = TabBarState.shared
    @EnvironmentObject private var env: AppEnvironment
    @State private var tabAvatar: UIImage?
    @State private var avatarRevision = UUID()

    var body: some View {
        nativeTabs
        .task(id: env.auth.uid) { await refreshAvatar() }
        .onReceive(NotificationCenter.default.publisher(for: .uniShareProfileDidUpdate)) { _ in
            Task { await refreshAvatar(forceRefresh: true) }
        }
        .sheet(isPresented: $tabState.showAirShare) { AirShareView() }
    }

    @ViewBuilder
    private var nativeTabs: some View {
        if #available(iOS 26.0, *) {
            TabView(selection: $tabState.selectedTab) {
                Tab(value: AppTab.feed) {
                    FeedView()
                } label: {
                    Image(systemName: "rectangle.stack.fill")
                        .accessibilityLabel("tab.feed".localized)
                        .accessibilityIdentifier("tab.feed")
                }
                Tab(value: AppTab.chats) {
                    ChatsView()
                } label: {
                    Image(systemName: "message")
                        .accessibilityLabel("tab.chats".localized)
                        .accessibilityIdentifier("tab.chats")
                }
                Tab(value: AppTab.profile) {
                    ProfileView()
                } label: {
                    profileTabIcon
                        .id(avatarRevision)
                        .accessibilityLabel("tab.profile".localized)
                        .accessibilityIdentifier("tab.profile")
                }
                Tab(value: AppTab.search, role: .search) {
                    ProfileSearchView()
                } label: {
                    Image(systemName: "magnifyingglass")
                        .accessibilityLabel("search.title".localized)
                        .accessibilityIdentifier("tab.search")
                }
            }
            .tabBarMinimizeBehavior(.onScrollDown)
        } else {
            TabView(selection: $tabState.selectedTab) {
                FeedView()
                    .tag(AppTab.feed)
                    .tabItem {
                        Image(systemName: "rectangle.stack.fill")
                            .accessibilityLabel("tab.feed".localized)
                            .accessibilityIdentifier("tab.feed")
                    }
                ChatsView()
                    .tag(AppTab.chats)
                    .tabItem {
                        Image(systemName: "message")
                            .accessibilityLabel("tab.chats".localized)
                            .accessibilityIdentifier("tab.chats")
                    }
                ProfileView()
                    .tag(AppTab.profile)
                    .tabItem {
                        profileTabIcon
                            .id(avatarRevision)
                            .accessibilityLabel("tab.profile".localized)
                            .accessibilityIdentifier("tab.profile")
                    }
                ProfileSearchView()
                    .tag(AppTab.search)
                    .tabItem {
                        Image(systemName: "magnifyingglass")
                            .accessibilityLabel("search.title".localized)
                            .accessibilityIdentifier("tab.search")
                    }
            }
        }
    }

    @ViewBuilder
    private var profileTabIcon: some View {
        if let tabAvatar {
            Image(uiImage: tabAvatar)
                .renderingMode(.original)
        } else {
            Image(systemName: "person.crop.circle")
        }
    }

    private func refreshAvatar(forceRefresh: Bool = false) async {
        guard let uid = env.auth.uid,
              let profile = try? await env.db.getUser(uid: uid, forceRefresh: forceRefresh),
              let url = profile.avatarUrl,
              !url.isEmpty,
              let image = await AvatarCacheService.shared.loadImage(from: url) else {
            tabAvatar = nil
            avatarRevision = UUID()
            return
        }
        tabAvatar = image.circularTabIcon()
        avatarRevision = UUID()
    }

}

private extension UIImage {
    func circularTabIcon() -> UIImage {
        let size = CGSize(width: 27, height: 27)
        let format = UIGraphicsImageRendererFormat()
        format.scale = UIScreen.main.scale
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).addClip()
            let scale = max(size.width / self.size.width, size.height / self.size.height)
            let drawSize = CGSize(width: self.size.width * scale, height: self.size.height * scale)
            let origin = CGPoint(x: (size.width - drawSize.width) / 2, y: (size.height - drawSize.height) / 2)
            draw(in: CGRect(origin: origin, size: drawSize))
        }.withRenderingMode(.alwaysOriginal)
    }
}
