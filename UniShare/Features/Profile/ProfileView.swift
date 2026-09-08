import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var localization: LocalizationManager

    @StateObject private var model: ProfileViewModel
    @State private var showsEditor = false
    @State private var showsSettings = false
    @State private var showsSkillsEditor = false
    @State private var showsSkillsCard = false

    init() {
        let environment = AppEnvironment.shared
        _model = StateObject(wrappedValue: ProfileViewModel(
            auth: environment.auth,
            db: environment.db,
            storage: environment.storage,
            rawg: environment.rawg
        ))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                BrandBackground()

                if model.isLoading && model.profile == nil {
                    ProgressView().tint(theme.effectivePrimary)
                } else if let profile = model.profile {
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 24) {
                            profileHeader(profile)

                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Text("profile.card.title".localized)
                                        .font(.system(size: 20, weight: .bold, design: .rounded))
                                        .foregroundStyle(theme.effectiveTextColor)
                                    Spacer()
                                    Label(
                                        showsSkillsCard ? "profile.card.exchange".localized : "profile.card.skills".localized,
                                        systemImage: "arrow.triangle.2.circlepath"
                                    )
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundStyle(theme.effectiveSecondaryTextColor)
                                }

                                ProfileCardPreview(card: .from(profile), isShowingSkills: $showsSkillsCard)
                            }
                            .padding(.horizontal, 16)

                            profileActions(profile)
                                .padding(.horizontal, 16)
                                .padding(.bottom, 32)
                        }
                    }
                    .ignoresSafeArea(edges: .top)
                    .scrollDismissesKeyboard(.interactively)
                    .refreshable { await model.load() }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await model.load() }
        .sheet(isPresented: $showsEditor) {
            EditProfileSheet(vm: model)
                .environmentObject(theme)
                .environmentObject(localization)
        }
        .sheet(isPresented: $showsSettings) {
            SettingsSheet(vm: model)
                .environmentObject(theme)
                .environmentObject(localization)
        }
        .sheet(isPresented: $showsSkillsEditor) {
            if let profile = model.profile {
                SkillsProfileSetupView(existingProfile: profile) { updated in
                    model.profile = updated
                }
                .environmentObject(theme)
            }
        }
        .alert("common.error".localized, isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("common.ok".localized, role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private func profileHeader(_ profile: UserProfile) -> some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    theme.effectivePrimary,
                    theme.effectiveTertiary.opacity(0.92),
                    Color(hex: "#19112F")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .fill(.white.opacity(0.13))
                .frame(width: 220, height: 220)
                .blur(radius: 36)
                .offset(x: 150, y: -100)
            LinearGradient(
                colors: [.black.opacity(0.18), .black.opacity(0.32), .black.opacity(0.82)],
                startPoint: .top,
                endPoint: .bottom
            )

            Button { showsSettings = true } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .adaptiveGlass(in: Circle(), interactive: true)
            }
            .accessibilityIdentifier("profile.settings")
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .padding(.top, 58)
            .padding(.trailing, 18)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .bottom, spacing: 14) {
                    AvatarView(url: profile.avatarUrl, size: 92, showBorder: true)
                        .background(Circle().fill(.black.opacity(0.28)))
                        .overlay(alignment: .bottomTrailing) {
                            Button {
                                model.startEditing()
                                showsEditor = true
                            } label: {
                                Image(systemName: "camera.fill")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 30, height: 30)
                                    .background(theme.effectivePrimary, in: Circle())
                            }
                        }

                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 6) {
                            Text(profile.username)
                                .font(.system(size: 25, weight: .black, design: .rounded))
                                .lineLimit(1)
                                .accessibilityIdentifier("profile.username")
                            if profile.rating >= 4.5 {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundStyle(Color(hex: "#72E6FF"))
                            }
                        }
                        if let status = profile.status, !status.isEmpty {
                            Text(status)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.white.opacity(0.72))
                                .lineLimit(2)
                        }
                    }
                }

                HStack(spacing: 9) {
                    ForEach(profile.platforms.compactMap(Platform.init(rawValue:)).prefix(5), id: \.rawValue) {
                        PlatformBadge(platform: $0, size: 22)
                    }
                    Spacer()
                    Label(
                        profile.rating > 0 ? String(format: "%.1f", profile.rating) : "profile.no.reviews".localized,
                        systemImage: "star.fill"
                    )
                    Label("\(profile.games.count + profile.platformGames.values.reduce(0) { $0 + $1.count })", systemImage: "gamecontroller.fill")
                    Label("\(profile.subscriptions.count)", systemImage: "ticket.fill")
                }
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.88))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .foregroundStyle(.white)
        .frame(height: 300)
        .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
        .shadow(color: .black.opacity(0.2), radius: 20, y: 10)
    }

    private func profileActions(_ profile: UserProfile) -> some View {
        HStack(spacing: 12) {
            Button {
                if showsSkillsCard {
                    showsSkillsEditor = true
                } else {
                    model.startEditing()
                    showsEditor = true
                }
            } label: {
                Label(
                    showsSkillsCard
                        ? (profile.hasSkillsProfile ? "profile.skills.edit".localized : "profile.skills.create".localized)
                        : "profile.exchange.edit".localized,
                    systemImage: showsSkillsCard ? "bolt.badge.checkmark" : "rectangle.stack.badge.plus"
                )
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: 16), interactive: true)
            }

            Button { showsSettings = true } label: {
                Image(systemName: "gearshape.fill")
                    .frame(width: 46, height: 46)
                    .adaptiveGlass(in: RoundedRectangle(cornerRadius: 16), interactive: true)
            }
        }
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(theme.effectiveTextColor)
    }
}

struct SkillsPortfolioGallery: View {
    let urls: [String]
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("profile.skills.portfolio".localized)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    ForEach(urls, id: \.self) { url in
                        AsyncImageView(url: url)
                            .frame(width: 190, height: 132)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}
