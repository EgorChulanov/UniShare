import SwiftUI

struct ChatsView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var theme: ThemeManager
    @StateObject private var vm: ChatsViewModel
    @State private var previewProfile: UserProfile?

    init() {
        let env = AppEnvironment.shared
        _vm = StateObject(wrappedValue: ChatsViewModel(auth: env.auth, db: env.db))
    }

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                ScrollView {
                    LazyVStack(spacing: 0) {
                        if !vm.requests.isEmpty { requestsSection }

                        if vm.chats.isEmpty && vm.requests.isEmpty {
                            emptyState
                        } else {
                            ForEach(vm.chats) { chat in
                                NavigationLink {
                                    ChatView(chat: chat)
                                } label: {
                                    chatRow(chat)
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("chats.row.\(chat.id)")

                                Divider()
                                    .padding(.leading, 82)
                            }
                        }
                    }
                    .padding(.top, 8)
                }
            }
            .navigationTitle("")
            .navigationBarHidden(true)
            .sheet(item: $previewProfile) { profile in
                ProfilePreviewSheet(profile: profile).environmentObject(theme)
            }
            .alert("common.error".localized, isPresented: Binding(
                get: { vm.errorMessage != nil },
                set: { if !$0 { vm.errorMessage = nil } }
            )) {
                Button("common.ok".localized, role: .cancel) {}
            } message: {
                Text(vm.errorMessage ?? "")
            }
        }
        .onAppear { vm.startListening() }
    }

    private var requestsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("chats.requests".localized)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 18)

            ForEach(vm.requests) { request in requestRow(request) }
        }
        .padding(.vertical, 10)
    }

    private func requestRow(_ request: LikeRequest) -> some View {
        let profile = vm.partnerProfiles[request.from]
        return HStack(spacing: 13) {
            Button {
                if let profile { previewProfile = profile }
            } label: {
                AvatarView(url: profile?.avatarUrl, size: 48, showBorder: true)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 5) {
                Text(profile?.username ?? request.from.prefix(8).description)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(theme.effectiveTextColor)
                typeBadge(request.requestType)
            }

            Spacer()

            Button { Task { await vm.declineRequest(request) } } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.red)
                    .frame(width: 34, height: 34)
                    .background(.red.opacity(0.12), in: Circle())
            }
            .accessibilityIdentifier("chats.request.decline.\(request.id)")
            Button { Task { await vm.acceptRequest(request) } } label: {
                Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.green)
                    .frame(width: 34, height: 34)
                    .background(.green.opacity(0.12), in: Circle())
            }
            .accessibilityIdentifier("chats.request.accept.\(request.id)")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
        .task { await vm.loadProfile(for: request) }
    }

    private func chatRow(_ chat: Chat) -> some View {
        let profile = vm.partnerProfiles[chat.partnerUid]
        let unread = chat.unreadCount(for: env.auth.uid ?? "")
        return HStack(spacing: 13) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(url: profile?.avatarUrl, size: 54)
                if chat.partnerStatus == "online" {
                    Circle()
                        .fill(.green)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(theme.effectiveBackground, lineWidth: 2))
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 7) {
                    Text(profile?.username ?? chat.partnerUid.prefix(8).description)
                        .font(.system(size: 15, weight: unread > 0 ? .semibold : .regular))
                        .foregroundStyle(theme.effectiveTextColor)
                    typeBadge(chat.chatType)
                }
                Text(chat.lastMessage.isEmpty ? "chat.empty".localized : chat.lastMessage)
                    .font(.system(size: 13))
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 7) {
                Text(chat.lastMessageAt.formatted(.relative(presentation: .numeric)))
                    .font(.system(size: 11))
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
                if unread > 0 {
                    Text("\(unread)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(theme.effectivePrimary, in: Circle())
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func typeBadge(_ type: String) -> some View {
        Text((type == "skills" ? "feed.segment.skills" : "feed.segment.exchange").localized)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(theme.effectiveSecondaryTextColor)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(theme.effectiveCardColor, in: Capsule())
            .overlay(Capsule().stroke(theme.effectiveTextColor.opacity(0.08)))
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "message")
                .font(.system(size: 46, weight: .light))
                .foregroundStyle(theme.effectiveSecondaryTextColor)
            Text("chats.empty".localized)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(theme.effectiveTextColor)
            Text("chats.empty.subtitle".localized)
                .font(.system(size: 14))
                .foregroundStyle(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 110)
        .padding(.horizontal, 40)
    }
}

// MARK: - Profile Preview Sheet

struct ProfilePreviewSheet: View {
    let profile: UserProfile
    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 20) {
                        // Hero card
                        ZStack(alignment: .bottomLeading) {
                            Group {
                                if let url = profile.avatarUrl {
                                    AsyncImageView(url: url)
                                        .frame(maxWidth: .infinity)
                                        .clipped()
                                } else {
                                    LinearGradient(
                                        colors: [theme.effectiveTertiary, theme.effectiveCardColor],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                    Image(systemName: "person.fill")
                                        .resizable().scaledToFit().padding(70)
                                        .foregroundColor(theme.effectiveSecondaryTextColor)
                                }
                            }
                            .frame(height: 280)

                            LinearGradient(
                                colors: [.clear, .black.opacity(0.8)],
                                startPoint: .center,
                                endPoint: .bottom
                            )

                            VStack(alignment: .leading, spacing: 6) {
                                Text(profile.username)
                                    .font(.system(size: 22, weight: .bold))
                                    .foregroundColor(.white)
                                if let status = profile.status, !status.isEmpty {
                                    Text(status).font(.system(size: 13)).foregroundColor(.white.opacity(0.8))
                                }
                                HStack(spacing: 6) {
                                    ForEach(profile.platforms.compactMap { Platform(rawValue: $0) }, id: \.rawValue) { p in
                                        PlatformBadge(platform: p, size: 22)
                                    }
                                }
                            }
                            .padding(16)
                        }
                        .frame(height: 280)
                        .cornerRadius(20)
                        .padding(.horizontal, 16)

                        // Games per platform
                        let platformList = profile.platforms.compactMap { Platform(rawValue: $0) }
                        if !platformList.isEmpty {
                            VStack(spacing: 0) {
                                ForEach(Array(platformList.enumerated()), id: \.1.rawValue) { idx, platform in
                                    let games = profile.platformGames[platform.rawValue] ?? []
                                    if !games.isEmpty {
                                        VStack(alignment: .leading, spacing: 8) {
                                            HStack(spacing: 8) {
                                                PlatformBadge(platform: platform, size: 18)
                                                Text(platform.rawValue)
                                                    .font(.system(size: 13, weight: .semibold))
                                                    .foregroundColor(platform.color)
                                            }
                                            .padding(.horizontal, 16)

                                            GameCirclesRow(games: games, color: platform.color, isTrailing: false)
                                        }
                                        .padding(.vertical, 12)

                                        if idx < platformList.count - 1 {
                                            Divider().padding(.horizontal, 16)
                                        }
                                    }
                                }
                            }
                            .background(theme.effectiveCardColor)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .padding(.horizontal, 16)
                        }

                        // Skills
                        if !profile.skills.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("profile.skills".localized)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(theme.effectiveSecondaryTextColor)
                                    .padding(.horizontal, 16)

                                FlowLayout(spacing: 8) {
                                    ForEach(profile.skills, id: \.self) { skill in
                                        Text(skill)
                                            .font(.system(size: 13))
                                            .foregroundColor(theme.effectiveTextColor)
                                            .padding(.horizontal, 12).padding(.vertical, 7)
                                            .background(theme.effectiveTertiary.opacity(0.3))
                                            .cornerRadius(20)
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                            .padding(.vertical, 12)
                            .background(theme.effectiveCardColor)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle(profile.username)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    }
                }
            }
        }
    }
}
