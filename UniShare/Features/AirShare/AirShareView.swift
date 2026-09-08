import SwiftUI

private struct AirShareCandidate: Identifiable {
    let nearby: ReceivedProfile
    let profile: UserProfile

    var id: String { profile.uid }
}

struct AirShareView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @StateObject private var manager = AirShareManager()

    @State private var myProfile: UserProfile?
    @State private var verifiedProfiles: [String: UserProfile] = [:]
    @State private var incomingRequests: [LikeRequest] = []
    @State private var selectedCandidate: AirShareCandidate?
    @State private var cancelRequests: (() -> Void)?
    @State private var processingIDs: Set<String> = []
    @State private var pulse = false
    @State private var errorMessage: String?
    @State private var isStarted = false

    var body: some View {
        GeometryReader { geometry in
            let contentWidth = min(max(geometry.size.width - 36, 1), 520)
            ZStack {
                BrandBackground()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: geometry.size.height < 760 ? 16 : 24) {
                        header
                        AirShareDevicePair(
                            connected: isConnected,
                            myAvatarURL: myProfile?.avatarUrl,
                            partnerAvatarURL: manager.discoveredProfiles.first?.avatarUrl,
                            pulse: pulse
                        )
                        .frame(height: min(geometry.size.height * 0.28, 220))

                        if isStarted { statusPill } else { startButton }
                        nearbySection
                    }
                    .frame(width: contentWidth)
                    .padding(.top, 18)
                    .padding(.bottom, 36)
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .task {
            await loadProfile()
            startRequestListener()
        }
        .onAppear { pulse = true }
        .onDisappear {
            cancelRequests?()
            cancelRequests = nil
            manager.stop()
        }
        .onChange(of: manager.discoveredProfiles.count) { count in
            guard count > 0 else { return }
            HapticsManager.shared.notification(.success)
            Task { await verifyDiscoveredProfiles() }
        }
        .sheet(item: $selectedCandidate) { candidate in
            AirShareDecisionSheet(
                card: feedCard(for: candidate.profile),
                isIncomingRequest: incomingRequest(from: candidate.profile.uid) != nil,
                onApprove: { approve(candidate) },
                onReject: { reject(candidate) }
            )
                .environmentObject(theme)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
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

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text("AirShare")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(theme.effectiveTextColor)
                Text("airshare.description".localized)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 38, height: 38)
                    .adaptiveGlass(in: Circle(), interactive: true)
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.effectiveTextColor)
        }
    }

    private var startButton: some View {
        Button(action: startNearbySearch) {
            Label("airshare.start".localized, systemImage: "antenna.radiowaves.left.and.right")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(
                    LinearGradient(
                        colors: [theme.effectivePrimary, theme.effectiveTertiary],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
        }
        .buttonStyle(.plain)
        .disabled(myProfile == nil)
        .opacity(myProfile == nil ? 0.55 : 1)
        .accessibilityIdentifier("airshare.start")
    }

    private var statusPill: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(statusColor)
                .frame(width: 9, height: 9)
                .scaleEffect(pulse ? 1.25 : 0.85)
                .animation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true), value: pulse)
            Text(manager.status.description)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(theme.effectiveTextColor)
            Spacer()
            Image(systemName: "wave.3.right")
                .foregroundStyle(statusColor)
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 17, style: .continuous))
    }

    @ViewBuilder
    private var nearbySection: some View {
        if !manager.discoveredProfiles.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("airshare.nearby".localized)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.effectiveTextColor)

                ForEach(manager.discoveredProfiles) { nearby in
                    nearbyCard(nearby)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if isStarted {
            Label("airshare.hold".localized, systemImage: "iphone.radiowaves.left.and.right")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(theme.effectiveSecondaryTextColor)
                .padding(.top, 2)
        }
    }

    private func nearbyCard(_ nearby: ReceivedProfile) -> some View {
        let profile = verifiedProfiles[nearby.uid]
        let request = incomingRequests.first { $0.from == nearby.uid && $0.requestType == "exchange" }

        return Button {
            if let profile {
                selectedCandidate = AirShareCandidate(nearby: nearby, profile: profile)
            }
        } label: {
            HStack(spacing: 13) {
                AvatarView(url: profile?.avatarUrl ?? nearby.avatarUrl, size: 52, showBorder: true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(profile?.username ?? nearby.username)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(theme.effectiveTextColor)
                        .lineLimit(1)
                    Text(profile == nil ? "airshare.verifying".localized : profileSummary(profile!))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(theme.effectiveSecondaryTextColor)
                        .lineLimit(2)
                }
                Spacer(minLength: 6)
                if request != nil {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(theme.effectivePrimary, in: Circle())
                        .accessibilityLabel("airshare.request.incoming".localized)
                }
                Image(systemName: profile == nil ? "hourglass" : "chevron.right")
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(profile == nil || request.map { processingIDs.contains($0.id) } == true)
        .padding(14)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous), interactive: true)
        .accessibilityIdentifier("airshare.profile.\(nearby.uid)")
    }

    private var isConnected: Bool {
        switch manager.status {
        case .holding, .sent, .received: return true
        default: return false
        }
    }

    private var statusColor: Color {
        switch manager.status {
        case .idle, .searching: return theme.effectiveSecondaryTextColor
        case .holding: return theme.effectivePrimary
        case .sent, .received: return .green
        case .bluetoothOff, .permissionDenied, .unsupported: return .orange
        }
    }

    private func profileSummary(_ profile: UserProfile) -> String {
        let values = (profile.games + profile.wantedGames).reduce(into: [String]()) { result, name in
            if !result.contains(name) { result.append(name) }
        }
        return values.isEmpty ? profile.platforms.prefix(3).joined(separator: " · ") : values.prefix(3).joined(separator: " · ")
    }

    private func incomingRequest(from uid: String) -> LikeRequest? {
        incomingRequests.first { $0.from == uid && $0.requestType == "exchange" }
    }

    private func feedCard(for profile: UserProfile) -> ProfileCard {
        var card = ProfileCard.from(profile)
        let profileGames = myProfile?.games ?? []
        let platformGames = myProfile?.platformGames.values.flatMap { $0 } ?? []
        let ownedGames = Set((profileGames + platformGames).map(GameNameValidator.normalized))
        card.matchingOwnedGames = Set(
            profile.wantedGames
                .map(GameNameValidator.normalized)
                .filter(ownedGames.contains)
        )
        return card
    }

    private func approve(_ candidate: AirShareCandidate) {
        selectedCandidate = nil
        if let request = incomingRequest(from: candidate.profile.uid) {
            Task { await accept(request) }
        } else {
            Task { await sendLike(to: candidate.nearby) }
        }
    }

    private func reject(_ candidate: AirShareCandidate) {
        selectedCandidate = nil
        if let request = incomingRequest(from: candidate.profile.uid) {
            Task { await decline(request, nearbyUID: candidate.profile.uid) }
        } else {
            manager.reject(uid: candidate.profile.uid)
        }
    }

    private func loadProfile() async {
        guard let uid = env.auth.uid else { return }
        myProfile = try? await env.db.getUser(uid: uid)
    }

    private func startRequestListener() {
        guard cancelRequests == nil, let uid = env.auth.uid else { return }
        cancelRequests = env.db.listenToLikeRequests(toUid: uid, requestType: "exchange") { requests in
            Task { @MainActor in incomingRequests = requests }
        }
    }

    private func startNearbySearch() {
        guard let myProfile else { return }
        isStarted = true
        manager.start(with: myProfile)
        HapticsManager.shared.impact(.light)
    }

    private func sendLike(to profile: ReceivedProfile) async {
        guard let myUID = env.auth.uid, profile.isVerified else {
            errorMessage = "airshare.verify.failed".localized
            return
        }
        let request = LikeRequest(
            id: "\(myUID)_\(profile.uid)_exchange",
            from: myUID,
            to: profile.uid,
            requestType: "exchange",
            createdAt: Date()
        )
        do {
            if try await env.db.sendLikeRequest(request) != nil {
                HapticsManager.shared.playMatch()
                TabBarState.shared.switchTo(.chats)
                dismiss()
            } else {
                manager.reject(uid: profile.uid)
                HapticsManager.shared.notification(.success)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func accept(_ request: LikeRequest) async {
        guard processingIDs.insert(request.id).inserted else { return }
        defer { processingIDs.remove(request.id) }
        incomingRequests.removeAll { $0.id == request.id }
        do {
            _ = try await env.db.acceptLikeRequest(id: request.id)
            HapticsManager.shared.playMatch()
            TabBarState.shared.switchTo(.chats)
            dismiss()
        } catch {
            incomingRequests.append(request)
            errorMessage = error.localizedDescription
        }
    }

    private func decline(_ request: LikeRequest, nearbyUID: String? = nil) async {
        guard processingIDs.insert(request.id).inserted else { return }
        defer { processingIDs.remove(request.id) }
        incomingRequests.removeAll { $0.id == request.id }
        do {
            try await env.db.deleteLikeRequest(id: request.id)
            if let nearbyUID { manager.reject(uid: nearbyUID) }
        } catch {
            incomingRequests.append(request)
            errorMessage = error.localizedDescription
        }
    }

    private func verifyDiscoveredProfiles() async {
        for nearby in manager.discoveredProfiles where !nearby.isVerified {
            do {
                guard let profile = try await env.db.getUser(uid: nearby.uid), profile.onboardingComplete else {
                    manager.reject(uid: nearby.uid)
                    continue
                }
                verifiedProfiles[nearby.uid] = profile
                manager.verify(nearby, with: profile)
            } catch {
                manager.reject(uid: nearby.uid)
                errorMessage = "airshare.verify.failed".localized
            }
        }
    }
}

struct AirShareDecisionSheet: View {
    let card: ProfileCard
    let isIncomingRequest: Bool
    let onApprove: () -> Void
    let onReject: () -> Void

    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @State private var renderedCard: ProfileCard

    init(
        card: ProfileCard,
        isIncomingRequest: Bool,
        onApprove: @escaping () -> Void,
        onReject: @escaping () -> Void
    ) {
        self.card = card
        self.isIncomingRequest = isIncomingRequest
        self.onApprove = onApprove
        self.onReject = onReject
        _renderedCard = State(initialValue: card)
    }

    var body: some View {
        GeometryReader { geometry in
            let width = min(max(geometry.size.width - 32, 1), 500)
            ZStack {
                BrandBackground()

                VStack(spacing: 16) {
                    header
                    Spacer(minLength: 0)
                    FeedCardsOverlay(
                        cards: [renderedCard],
                        onSwipeRight: { _ in onApprove() },
                        onSwipeLeft: { _ in onReject() }
                    )
                    .frame(width: width, height: 474)
                    swipeHint
                    Spacer(minLength: 0)
                }
                .padding(.top, 12)
                .padding(.bottom, 12)
            }
        }
        .task(id: card.userId) {
            renderedCard = await ProfileCardArtworkLoader.enrich(card)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(isIncomingRequest ? "airshare.request.title".localized : "airshare.profile.title".localized)
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundStyle(theme.effectiveTextColor)
                Text(isIncomingRequest ? "airshare.request.subtitle".localized : "airshare.profile.subtitle".localized)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 38, height: 38)
                    .adaptiveGlass(in: Circle(), interactive: true)
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.effectiveTextColor)
            .accessibilityIdentifier("airshare.card.close")
        }
        .padding(.horizontal, 18)
    }

    private var swipeHint: some View {
        HStack(spacing: 22) {
            Label("airshare.swipe.decline".localized, systemImage: "arrow.left")
                .foregroundStyle(.red)
            Label("airshare.swipe.accept".localized, systemImage: "arrow.right")
                .foregroundStyle(.green)
        }
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .padding(.horizontal, 18)
        .frame(height: 38)
        .adaptiveGlass(in: Capsule())
    }
}

private struct AirShareDevicePair: View {
    let connected: Bool
    let myAvatarURL: String?
    let partnerAvatarURL: String?
    let pulse: Bool

    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geometry in
            let phoneWidth = min(geometry.size.width * 0.25, 104)
            let travel = min(geometry.size.width * 0.22, 78)

            ZStack {
                Circle()
                    .fill(theme.effectivePrimary.opacity(0.18))
                    .frame(width: min(geometry.size.width * 0.78, 340))
                    .blur(radius: 25)
                    .scaleEffect(pulse ? 1.06 : 0.94)

                device(width: phoneWidth, avatarURL: myAvatarURL)
                    .rotationEffect(.degrees(connected ? -3 : (pulse ? -8 : -12)))
                    .offset(x: connected ? -travel * 0.56 : -travel, y: pulse ? 0 : 6)

                device(width: phoneWidth, avatarURL: partnerAvatarURL)
                    .rotationEffect(.degrees(connected ? 3 : (pulse ? 8 : 12)))
                    .offset(x: connected ? travel * 0.56 : travel, y: pulse ? 6 : 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(reduceMotion ? nil : .spring(response: 0.72, dampingFraction: 0.7), value: connected)
            .animation(
                reduceMotion ? nil : .easeInOut(duration: 1.8).repeatForever(autoreverses: true),
                value: pulse
            )
        }
    }

    private func device(width: CGFloat, avatarURL: String?) -> some View {
        ZStack {
            Image("AirSharePhone")
                .resizable()
                .scaledToFit()

            AvatarView(url: avatarURL, size: width * 0.30, showBorder: true)
                .offset(y: width * 0.15)
        }
        .frame(width: width)
        .shadow(color: .black.opacity(0.22), radius: 14, y: 10)
    }
}
