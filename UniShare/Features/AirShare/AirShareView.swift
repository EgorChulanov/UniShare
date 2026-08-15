import SwiftUI

struct AirShareView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @StateObject private var manager = AirShareManager()

    @State private var myProfile: UserProfile?
    @State private var selectedProfile: ReceivedProfile?
    @State private var showProfileCard = false
    @State private var pulse = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            BrandBackground()

            // Ambient glow behind phones
            Circle()
                .fill(RadialGradient(
                    colors: [theme.effectivePrimary.opacity(0.3), .clear],
                    center: .center, startRadius: 0, endRadius: 200
                ))
                .frame(width: 400, height: 400)
                .scaleEffect(pulse ? 1.15 : 1.0)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: pulse)
                .ignoresSafeArea()

            VStack(spacing: 28) {
                // Header
                VStack(spacing: 6) {
                    Text("AirShare")
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

                // Status pill
                statusPill

                // Discovered profiles
                if !manager.discoveredProfiles.isEmpty {
                    discoveredList
                }

                Spacer()
            }
            .padding(.top, 48)
        }
        .task { await loadAndStart() }
        .onAppear { pulse = true }
        .onDisappear { manager.stop() }
        .onChange(of: manager.discoveredProfiles.count) { count in
            if count > 0 {
                HapticsManager.shared.notification(.success)
                Task { await verifyDiscoveredProfiles() }
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
        .alert("common.error".localized, isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("common.ok".localized, role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - Phone Animation

    private var connected: Bool {
        if case .holding = manager.status { return true }
        if case .sent = manager.status { return true }
        if case .received = manager.status { return true }
        return false
    }

    private var phoneAnimation: some View {
        HStack(spacing: connected ? -20 : 56) {
            // My phone
            VStack(spacing: 8) {
                ZStack {
                    Image(systemName: "iphone")
                        .font(.system(size: 60))
                        .foregroundColor(theme.effectivePrimary)
                        .rotationEffect(.degrees(-12))
                    if let p = myProfile {
                        AvatarView(url: p.avatarUrl, size: 28)
                            .offset(x: -2, y: 6)
                    }
                }
                Text(myProfile?.username ?? "airshare.me".localized)
                    .font(.system(size: 11))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }
            .offset(x: connected ? 8 : 0)

            // Partner phone
            VStack(spacing: 8) {
                ZStack {
                    Image(systemName: "iphone")
                        .font(.system(size: 60))
                        .foregroundColor(theme.effectiveTertiary)
                        .rotationEffect(.degrees(12))
                    if let first = manager.discoveredProfiles.first {
                        AvatarView(url: first.avatarUrl, size: 28)
                            .offset(x: 2, y: 6)
                    } else {
                        Image(systemName: "questionmark")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                            .offset(x: 2, y: 6)
                    }
                }
                Text(manager.discoveredProfiles.first?.username ?? "?")
                    .font(.system(size: 11))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }
            .offset(x: connected ? -8 : 0)
        }
        .animation(.spring(response: 0.6, dampingFraction: 0.65), value: connected)
        .padding(.vertical, 16)
    }

    // MARK: - Status Pill

    private var statusPill: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
                .scaleEffect(pulse ? 1.3 : 1.0)
                .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: pulse)

            Text(manager.status.description)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.effectiveTextColor)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(theme.effectiveCardColor)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(statusColor.opacity(0.4), lineWidth: 1))
    }

    private var statusColor: Color {
        switch manager.status {
        case .idle, .searching: return theme.effectiveSecondaryTextColor
        case .holding: return theme.effectivePrimary
        case .sent: return .green
        case .received: return .green
        case .bluetoothOff, .permissionDenied, .unsupported: return .orange
        }
    }

    // MARK: - Discovered Profiles

    private var discoveredList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("airshare.nearby".localized)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 20)

            ForEach(manager.discoveredProfiles) { profile in
                Button {
                    selectedProfile = profile
                    showProfileCard = true
                } label: {
                    HStack(spacing: 14) {
                        AvatarView(url: profile.avatarUrl, size: 48, showBorder: true)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(profile.username)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(theme.effectiveTextColor)
                            if !profile.games.isEmpty {
                                Text(profile.games.prefix(3).joined(separator: " · "))
                                    .font(.system(size: 12))
                                    .foregroundColor(theme.effectiveSecondaryTextColor)
                                    .lineLimit(1)
                            }
                            if !profile.isVerified {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(theme.effectivePrimary)
                            }
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.system(size: 13))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    }
                    .padding(14)
                    .background(theme.effectiveCardColor)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(theme.effectivePrimary.opacity(0.25), lineWidth: 1))
                    .padding(.horizontal, 16)
                }
                .buttonStyle(.plain)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                        removal: .opacity))
            }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.75), value: manager.discoveredProfiles.count)
    }

    // MARK: - Actions

    private func loadAndStart() async {
        guard let uid = env.auth.uid else { return }
        if let profile = try? await env.db.getUser(uid: uid) {
            myProfile = profile
            manager.start(with: profile)
        }
    }

    private func sendLike(to profile: ReceivedProfile) async {
        guard let myUid = env.auth.uid else { return }
        guard profile.isVerified else {
            errorMessage = "airshare.verify.failed".localized
            return
        }
        let requestId = "\(myUid)_\(profile.uid)_exchange"
        let request = LikeRequest(id: requestId, from: myUid, to: profile.uid, requestType: "exchange", createdAt: Date())
        do {
            let chatId = try await env.db.sendLikeRequest(request)
            if chatId != nil {
                HapticsManager.shared.playMatch()
                TabBarState.shared.switchTo(.chats)
            }
            showProfileCard = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verifyDiscoveredProfiles() async {
        let pending = manager.discoveredProfiles.filter { !$0.isVerified }
        for nearby in pending {
            do {
                guard let profile = try await env.db.getUser(uid: nearby.uid),
                      profile.onboardingComplete else {
                    manager.reject(uid: nearby.uid)
                    continue
                }
                manager.verify(nearby, with: profile)
            } catch {
                manager.reject(uid: nearby.uid)
                errorMessage = "airshare.verify.failed".localized
            }
        }
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
            BrandBackground()

            VStack(spacing: 0) {
                Capsule()
                    .fill(theme.effectiveSecondaryTextColor.opacity(0.35))
                    .frame(width: 40, height: 4)
                    .padding(.top, 14)
                    .padding(.bottom, 24)

                AvatarView(url: profile.avatarUrl, size: 100, showBorder: true)
                    .padding(.bottom, 16)

                Text(profile.username)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(theme.effectiveTextColor)

                if !profile.platforms.isEmpty {
                    HStack(spacing: 10) {
                        ForEach(profile.platforms, id: \.rawValue) { p in
                            PlatformBadge(platform: p, size: 26)
                        }
                    }
                    .padding(.top, 8)
                }

                if !profile.games.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(profile.games, id: \.self) { game in
                                Text(game)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(theme.effectiveTextColor)
                                    .padding(.horizontal, 12).padding(.vertical, 7)
                                    .background(theme.effectivePrimary.opacity(0.15))
                                    .clipShape(Capsule())
                            }
                        }
                        .padding(.horizontal, 24)
                    }
                    .padding(.top, 16)
                }

                Spacer()

                HStack(spacing: 24) {
                    Button(action: onDismiss) {
                        Label("airshare.skip".localized, systemImage: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(Color.red.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }

                    Button(action: onLike) {
                        Label("airshare.like".localized, systemImage: "heart.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(
                                LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                               startPoint: .leading, endPoint: .trailing)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
        .presentationDetents([.medium, .large])
    }
}
