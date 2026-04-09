import SwiftUI

struct ChatsView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: ChatsViewModel
    @State private var selectedChat: Chat?

    init() {
        _vm = StateObject(wrappedValue: ChatsViewModel(
            auth: FirebaseAuthService(),
            firestore: FirestoreService()
        ))
    }

    var currentChats: [Chat] {
        vm.selectedSegment == .exchange ? vm.exchangeChats : vm.skillChats
    }

    var currentRequests: [LikeRequest] {
        vm.selectedSegment == .exchange ? vm.exchangeRequests : vm.skillRequests
    }

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    segmentPicker

                    ScrollView {
                        LazyVStack(spacing: 0) {
                            // Like requests
                            if !currentRequests.isEmpty {
                                requestsSection
                            }

                            // Chat list
                            if currentChats.isEmpty && currentRequests.isEmpty {
                                emptyState
                            } else {
                                ForEach(currentChats) { chat in
                                    NavigationLink {
                                        ChatView(chat: chat)
                                    } label: {
                                        chatRow(chat)
                                    }
                                    Divider()
                                        .background(theme.effectiveCardColor)
                                        .padding(.leading, 76)
                                }
                            }
                        }
                    }
                    .refreshable {
                        // Listeners handle real-time updates; pull to refresh is cosmetic
                    }
                }
            }
            .navigationTitle("tab.chats".localized)
            .navigationBarTitleDisplayMode(.large)
        }
        .onAppear { vm.startListening() }
    }

    // MARK: - Segment Picker

    private var segmentPicker: some View {
        HStack(spacing: 0) {
            ForEach(ChatsSegment.allCases, id: \.localizedKey) { seg in
                Button {
                    withAnimation { vm.selectedSegment = seg }
                } label: {
                    Text(seg.localizedKey.localized)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(vm.selectedSegment == seg ? .white : theme.effectiveSecondaryTextColor)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(
                            vm.selectedSegment == seg ?
                            LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .leading, endPoint: .trailing) :
                            LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing)
                        )
                        .cornerRadius(10)
                }
            }
        }
        .padding(4)
        .glass(cornerRadius: 14)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Requests Section

    private var requestsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("chats.requests".localized)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 16)

            ForEach(currentRequests) { request in
                requestRow(request)
            }
        }
        .padding(.top, 8)
    }

    private func requestRow(_ request: LikeRequest) -> some View {
        let profile = vm.partnerProfiles[request.from]
        return HStack(spacing: 14) {
            AvatarView(url: profile?.avatarUrl, size: 48, showBorder: true)

            VStack(alignment: .leading, spacing: 4) {
                Text(profile?.username ?? request.from.prefix(8).description)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.effectiveTextColor)
                Text("wants to exchange")
                    .font(.system(size: 13))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }

            Spacer()

            HStack(spacing: 8) {
                Button {
                    Task { await vm.declineRequest(request) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.red)
                        .frame(width: 34, height: 34)
                        .background(Color.red.opacity(0.15))
                        .clipShape(Circle())
                }

                Button {
                    Task { await vm.acceptRequest(request) }
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.green)
                        .frame(width: 34, height: 34)
                        .background(Color.green.opacity(0.15))
                        .clipShape(Circle())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .onAppear {
            Task {
                if vm.partnerProfiles[request.from] == nil,
                   let profile = try? await FirestoreService().getUser(uid: request.from) {
                    vm.partnerProfiles[request.from] = profile
                }
            }
        }
    }

    // MARK: - Chat Row

    private func chatRow(_ chat: Chat) -> some View {
        let profile = vm.partnerProfiles[chat.partnerUid]
        let unread = chat.unreadCount(for: env.auth.uid ?? "")
        return HStack(spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(url: profile?.avatarUrl, size: 52)

                // Online indicator
                if chat.partnerStatus == "online" {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(theme.effectiveBackground, lineWidth: 2))
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(profile?.username ?? chat.partnerUid.prefix(8).description)
                    .font(.system(size: 15, weight: unread > 0 ? .semibold : .regular))
                    .foregroundColor(theme.effectiveTextColor)

                Text(chat.lastMessage.isEmpty ? "chat.empty".localized : chat.lastMessage)
                    .font(.system(size: 13))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 6) {
                Text(chat.lastMessageAt.formatted(.relative(presentation: .numeric)))
                    .font(.system(size: 11))
                    .foregroundColor(theme.effectiveSecondaryTextColor)

                if unread > 0 {
                    Text("\(unread)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(theme.effectivePrimary)
                        .clipShape(Circle())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "message.circle")
                .font(.system(size: 56))
                .foregroundColor(theme.effectiveSecondaryTextColor)
            Text("chats.empty".localized)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(theme.effectiveTextColor)
            Text("chats.empty.subtitle".localized)
                .font(.system(size: 14))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 60)
    }
}
