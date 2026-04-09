import SwiftUI

struct AirShareView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @StateObject private var manager = AirShareManager()

    @State private var myProfile: UserProfile?
    @State private var showProfileCard = false
    @State private var selectedProfile: ReceivedProfile?
    @State private var phoneOffset: CGFloat = 0
    @State private var phoneCross = false

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            // Animated gradient background
            AnimatedFullScreenGlow(isExpanded: phoneCross)
                .opacity(0.3)

            VStack(spacing: 32) {
                // Title
                VStack(spacing: 8) {
                    Text("airshare.title".localized)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(theme.effectiveTextColor)

                    Text("airshare.description".localized)
                        .font(.system(size: 14))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                // Phone animation
                phoneAnimation

                // Status
                Text(manager.status.description)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .animation(.easeInOut, value: manager.status.description)

                // Received profiles list
                if !manager.discoveredProfiles.isEmpty {
                    receivedProfilesList
                }

                Spacer()
            }
            .padding(.top, 40)
        }
        .task {
            await loadAndStart()
        }
        .onDisappear {
            manager.stop()
        }
        .onChange(of: manager.discoveredProfiles.count) { count in
            if count > 0 {
                withAnimation(.spring()) { phoneCross = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    withAnimation(.spring()) { phoneCross = false }
                }
            }
        }
        .sheet(isPresented: $showProfileCard) {
            if let profile = selectedProfile {
                AirShareProfileCard(
                    profile: profile,
                    onLike: { Task { await sendLike(to: profile) } },
                    onDismiss: { showProfileCard = false }
                )
                .environmentObject(theme)
                .environmentObject(env)
            }
        }
    }

    // MARK: - Phone Animation

    private var phoneAnimation: some View {
        HStack(spacing: phoneCross ? -30 : 60) {
            // My phone
            VStack(spacing: 8) {
                Image(systemName: "iphone")
                    .font(.system(size: 56))
                    .foregroundColor(theme.effectivePrimary)
                    .rotationEffect(.degrees(-15))

                if let profile = myProfile {
                    AvatarView(url: profile.avatarUrl, size: 36)
                }
            }
            .offset(x: phoneCross ? 10 : 0)
            .animation(.spring(response: 0.6, dampingFraction: 0.7), value: phoneCross)

            // Partner phone
            VStack(spacing: 8) {
                Image(systemName: "iphone")
                    .font(.system(size: 56))
                    .foregroundColor(theme.effectiveTertiary)
                    .rotationEffect(.degrees(15))

                Text("?")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .frame(width: 36, height: 36)
                    .background(theme.effectiveCardColor)
                    .clipShape(Circle())
            }
            .offset(x: phoneCross ? -10 : 0)
            .animation(.spring(response: 0.6, dampingFraction: 0.7), value: phoneCross)
        }
        .padding(.vertical, 20)
    }

    // MARK: - Received Profiles

    private var receivedProfilesList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("airshare.found".localized)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 16)

            ForEach(manager.discoveredProfiles) { profile in
                Button {
                    selectedProfile = profile
                    showProfileCard = true
                } label: {
                    HStack(spacing: 14) {
                        AvatarView(url: profile.avatarUrl, size: 48, showBorder: true)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(profile.username)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(theme.effectiveTextColor)

                            if !profile.games.isEmpty {
                                Text(profile.games.prefix(2).joined(separator: ", "))
                                    .font(.system(size: 12))
                                    .foregroundColor(theme.effectiveSecondaryTextColor)
                                    .lineLimit(1)
                            }
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    }
                    .padding()
                    .glass(cornerRadius: 16)
                    .padding(.horizontal, 16)
                }
            }
        }
    }

    // MARK: - Actions

    private func loadAndStart() async {
        guard let uid = env.auth.uid else { return }
        if let profile = try? await env.firestore.getUser(uid: uid) {
            myProfile = profile
            manager.start(with: profile)
        }
    }

    private func sendLike(to profile: ReceivedProfile) async {
        guard let myUid = env.auth.uid else { return }
        let requestId = "\(myUid)_\(profile.uid)_exchange"
        let request = LikeRequest(id: requestId, from: myUid, to: profile.uid, requestType: "exchange", createdAt: Date())
        try? await env.firestore.sendLikeRequest(request)

        // Check mutual
        if let existingId = try? await env.firestore.checkMutualLike(fromUid: myUid, toUid: profile.uid, requestType: "exchange") {
            _ = try? await env.firestore.createChat(participants: [myUid, profile.uid], chatType: "exchange")
            try? await env.firestore.deleteLikeRequest(id: existingId)
            HapticsManager.shared.playMatch()
            TabBarState.shared.switchTo(.chats)
        }
        showProfileCard = false
    }
}

// MARK: - AirShareProfileCard

struct AirShareProfileCard: View {
    let profile: ReceivedProfile
    let onLike: () -> Void
    let onDismiss: () -> Void

    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            VStack(spacing: 24) {
                // Drag indicator
                Capsule()
                    .fill(theme.effectiveSecondaryTextColor.opacity(0.4))
                    .frame(width: 40, height: 4)
                    .padding(.top, 12)

                AvatarView(url: profile.avatarUrl, size: 100, showBorder: true)

                VStack(spacing: 8) {
                    Text(profile.username)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(theme.effectiveTextColor)

                    if !profile.platforms.isEmpty {
                        PlatformBadgeRow(platforms: profile.platforms, size: 32)
                    }

                    if !profile.games.isEmpty {
                        GameTagsScrollView(tags: profile.games.map { GameTag(name: $0) })
                    }
                }

                Spacer()

                // Action buttons
                HStack(spacing: 20) {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.red)
                            .frame(width: 64, height: 64)
                            .background(Color.red.opacity(0.15))
                            .clipShape(Circle())
                    }

                    Button(action: onLike) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.green)
                            .frame(width: 64, height: 64)
                            .background(Color.green.opacity(0.15))
                            .clipShape(Circle())
                    }
                }
                .padding(.bottom, 40)
            }
        }
    }
}
