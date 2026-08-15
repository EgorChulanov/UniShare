import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: ProfileViewModel
    @State private var showEditProfile = false
    @State private var showSettings = false
    @State private var showSkillsSetup = false

    init() {
        let env = AppEnvironment.shared
        _vm = StateObject(wrappedValue: ProfileViewModel(
            auth: env.auth,
            db: env.db,
            storage: env.storage,
            rawg: env.rawg
        ))
    }

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            if vm.isLoading && vm.profile == nil {
                ProgressView().tint(theme.effectivePrimary)
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        if let profile = vm.profile {
                            // ── Figma-style centered gradient hero ──
                            profileHero(profile: profile)

                            VStack(spacing: 16) {
                                // Games card
                                gamesCard(profile: profile)

                                // Skills card
                                if !profile.skills.isEmpty {
                                    skillsSection(profile.skills)
                                }

                                // Subscriptions
                                if !profile.subscriptions.isEmpty {
                                    subsSection(profile.subscriptions)
                                }

                                // Skills profile CTA
                                skillsProfileButton(profile: profile)

                                // Settings
                                Button { showSettings = true } label: {
                                    HStack(spacing: 14) {
                                        Image(systemName: "gearshape.fill")
                                            .foregroundColor(theme.effectivePrimary).frame(width: 22)
                                        Text("profile.settings".localized)
                                            .font(.system(size: 15)).foregroundColor(theme.effectiveTextColor)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12))
                                            .foregroundColor(theme.effectiveSecondaryTextColor)
                                    }
                                    .padding()
                                    .glass(cornerRadius: 14)
                                }
                                .accessibilityIdentifier("profile.settings")
                                .padding(.horizontal, 16)
                                .padding(.bottom, 32)
                            }
                            .padding(.top, 20)
                        }
                    }
                }
            }
        }
        .task { await vm.load() }
        .sheet(isPresented: $showEditProfile) {
            EditProfileSheet(vm: vm)
                .environmentObject(theme)
                .environmentObject(localization)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet(vm: vm)
                .environmentObject(theme)
                .environmentObject(localization)
        }
        .sheet(isPresented: $showSkillsSetup) {
            if let profile = vm.profile {
                SkillsProfileSetupView(existingProfile: profile) { updated in
                    vm.profile = updated
                }
                .environmentObject(theme)
            }
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

    // MARK: - Profile header

    private func profileHero(profile: UserProfile) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 18) {
                ZStack(alignment: .bottomTrailing) {
                    Circle()
                        .fill(theme.effectivePrimary.opacity(0.32))
                        .frame(width: 116, height: 116)
                        .blur(radius: 22)
                    AvatarView(url: profile.avatarUrl, size: 100, showBorder: true)
                    Button {
                        vm.startEditing(); showEditProfile = true
                    } label: {
                        Circle()
                            .fill(theme.effectivePrimary)
                            .frame(width: 28, height: 28)
                            .overlay(Image(systemName: "camera.fill")
                                .font(.system(size: 11)).foregroundColor(.white))
                    }
                    .offset(x: 3, y: 3)
                }

                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 7) {
                        Text("@\(profile.username)")
                            .font(.system(size: 21, weight: .bold, design: .rounded))
                            .foregroundColor(theme.effectiveTextColor)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .accessibilityIdentifier("profile.username")
                        if profile.rating >= 4.5 {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundStyle(theme.effectivePrimary)
                        }
                    }

                    if let status = profile.status, !status.isEmpty {
                        Text(status)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                            .lineLimit(2)
                    }

                    Button {
                        vm.startEditing(); showEditProfile = true
                    } label: {
                        Label("profile.edit".localized, systemImage: "pencil")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(theme.effectiveTextColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(theme.effectiveCardColor, in: Capsule())
                            .overlay(Capsule().stroke(theme.effectiveTextColor.opacity(0.12)))
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }
            if !platforms.isEmpty || profile.rating > 0 {
                HStack(spacing: 8) {
                    PlatformBadgeRow(platforms: platforms, size: 30)
                    Spacer()
                    if profile.rating > 0 {
                        Label(String(format: "%.1f", profile.rating), systemImage: "star.fill")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(theme.effectiveTextColor)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(theme.effectiveCardColor, in: Capsule())
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 8)
    }

    // MARK: - Games card

    private func gamesCard(profile: UserProfile) -> some View {
        let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }
        guard !platforms.isEmpty else { return AnyView(EmptyView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 0) {
                Text("profile.games".localized)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 8)

                ForEach(Array(platforms.enumerated()), id: \.1.rawValue) { idx, platform in
                    if idx > 0 { Divider().padding(.horizontal, 16) }
                    profilePlatformRow(
                        platform: platform,
                        games: profile.platformGames[platform.rawValue] ?? [],
                        isTrailing: idx % 2 == 1
                    )
                }

                Color.clear.frame(height: 8)
            }
            .background(theme.effectiveCardColor)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.07), lineWidth: 1))
            .shadow(color: .black.opacity(0.15), radius: 8, y: 3)
            .padding(.horizontal, 16)
            .onTapGesture { vm.startEditing(); showEditProfile = true }
        )
    }

    private func profilePlatformRow(platform: Platform, games: [String], isTrailing: Bool) -> some View {
        VStack(alignment: isTrailing ? .trailing : .leading, spacing: 8) {
            Text(platform.rawValue)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(platform.color)
                .padding(.horizontal, 16)

            HStack(spacing: 0) {
                if isTrailing { Spacer(minLength: 0) }
                HStack(spacing: 10) {
                    if games.isEmpty {
                        Text("profile.games.add.hint".localized)
                            .font(.system(size: 12))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    } else {
                        ForEach(games.prefix(5), id: \.self) { name in
                            profileGameCircle(name: name, color: platform.color)
                        }
                    }
                }
                .padding(.horizontal, 16)
                if !isTrailing { Spacer(minLength: 0) }
            }
        }
        .padding(.vertical, 12)
    }

    private func profileGameCircle(name: String, color: Color) -> some View {
        VStack(spacing: 3) {
            ProfileGameArtwork(name: name, fallbackColor: color)

            Text(name.components(separatedBy: " ").first ?? name)
                .font(.system(size: 8))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .lineLimit(1)
                .frame(width: 44)
        }
    }

    // MARK: - Skills Profile Button

    private func skillsProfileButton(profile: UserProfile) -> some View {
        Button {
            showSkillsSetup = true
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [theme.effectivePrimary, theme.effectiveTertiary],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 36, height: 36)
                    Image(systemName: profile.hasSkillsProfile ? "person.crop.circle.badge.checkmark" : "plus.circle")
                        .font(.system(size: 16))
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(profile.hasSkillsProfile ? "profile.skills.edit".localized : "profile.skills.create".localized)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.effectiveTextColor)
                    Text(profile.hasSkillsProfile
                        ? (profile.skills.prefix(3).joined(separator: ", "))
                        : "profile.skills.subtitle".localized)
                        .font(.system(size: 12))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }
            .padding(14)
            .background(
                LinearGradient(
                    colors: [theme.effectivePrimary.opacity(0.12), theme.effectiveTertiary.opacity(0.08)],
                    startPoint: .leading, endPoint: .trailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(theme.effectivePrimary.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
    }

    // MARK: - Skills

    private func skillsSection(_ skills: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("profile.skills".localized)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 16)

            FlowLayout(spacing: 8) {
                ForEach(skills, id: \.self) { skill in
                    Text(skill)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.effectiveTextColor)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(theme.effectiveTertiary.opacity(0.3))
                        .cornerRadius(20)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Subscriptions

    private func subsSection(_ subs: [LocalUserSubscription]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("profile.subscriptions".localized)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 16)

            VStack(spacing: 8) {
                ForEach(subs) { sub in
                    VStack(alignment: .leading, spacing: 9) {
                        HStack(spacing: 12) {
                        BrandIcon(assetName: sub.brandAssetName, systemName: sub.iconName)
                            .foregroundStyle(theme.effectivePrimary)
                            .frame(width: 22, height: 22)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(sub.name)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.effectiveTextColor)
                            if let plan = sub.planName, !plan.isEmpty {
                                Text(plan).font(.system(size: 11)).foregroundStyle(theme.effectiveSecondaryTextColor)
                            }
                            if let date = sub.expiresAt {
                                Text(String(format: "subscription.expires".localized, date.formatted(date: .abbreviated, time: .omitted)))
                                    .font(.system(size: 11))
                                    .foregroundStyle(theme.effectiveSecondaryTextColor)
                            }
                        }
                        Spacer()
                            if sub.autoRenew == true {
                                Image(systemName: "arrow.triangle.2.circlepath")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(theme.effectivePrimary)
                            }
                        }
                        if let progress = sub.remainingFraction, let days = sub.daysRemaining {
                            ProgressView(value: progress)
                                .tint(theme.effectivePrimary)
                            Text(String(format: "subscription.days.remaining".localized, days))
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(theme.effectiveSecondaryTextColor)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .glass(cornerRadius: 12)
                    .padding(.horizontal, 16)
                }
            }
        }
    }
}

private struct ProfileGameArtwork: View {
    let name: String
    let fallbackColor: Color
    @State private var coverURL: String?

    var body: some View {
        ZStack {
            Circle().fill(fallbackColor.opacity(0.14))
            if let coverURL {
                AsyncImageView(url: coverURL)
                    .frame(width: 44, height: 44)
                    .clipShape(Circle())
            } else {
                Text(String(name.prefix(2)).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(fallbackColor)
            }
        }
        .frame(width: 44, height: 44)
        .overlay(Circle().stroke(fallbackColor.opacity(0.28), lineWidth: 1))
        .task(id: name) {
            coverURL = await AppEnvironment.shared.rawg.searchGames(name).first?.backgroundImage
        }
    }
}
