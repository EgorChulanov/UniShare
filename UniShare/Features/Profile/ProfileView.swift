import SwiftUI
import PhotosUI

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
            GrainOverlay(opacity: 0.14)

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
    }

    // MARK: - Figma-style centered hero header

    private func profileHero(profile: UserProfile) -> some View {
        ZStack(alignment: .top) {
            // Gradient glow from top (matches Figma dark bg + pink radial)
            RadialGradient(
                colors: [theme.effectivePrimary.opacity(0.55), .clear],
                center: .top, startRadius: 0, endRadius: 300
            )
            .frame(height: 320)
            .ignoresSafeArea(edges: .top)

            VStack(spacing: 10) {
                // Avatar with edit button
                ZStack(alignment: .bottomTrailing) {
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
                .padding(.top, 20)

                // Username
                HStack(spacing: 8) {
                    Text("@\(profile.username)")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(theme.effectiveTextColor)
                    Button {
                        vm.startEditing(); showEditProfile = true
                    } label: {
                        Image(systemName: "pencil.circle.fill")
                            .font(.system(size: 17))
                            .foregroundColor(theme.effectivePrimary.opacity(0.8))
                    }
                }

                // Status
                if let status = profile.status, !status.isEmpty {
                    Text(status)
                        .font(.system(size: 13))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                        .multilineTextAlignment(.center)
                }

                // Platforms + rating — "PC · PlayStation · Nintendo · ★ 4.8"
                let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }
                if !platforms.isEmpty || profile.rating > 0 {
                    HStack(spacing: 6) {
                        ForEach(Array(platforms.enumerated()), id: \.0) { idx, p in
                            if idx > 0 { Text("·").foregroundColor(theme.effectiveSecondaryTextColor) }
                            Text(p.rawValue)
                                .font(.system(size: 12))
                                .foregroundColor(theme.effectiveSecondaryTextColor)
                        }
                        if profile.rating > 0 {
                            Text("·").foregroundColor(theme.effectiveSecondaryTextColor)
                            Image(systemName: "star.fill")
                                .font(.system(size: 10)).foregroundColor(.yellow)
                            Text(String(format: "%.1f", profile.rating))
                                .font(.system(size: 12))
                                .foregroundColor(theme.effectiveSecondaryTextColor)
                        }
                    }
                    .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, 20)
        }
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

    // MARK: - Profile Card (legacy — kept for compilation)

    private func profileCard(profile: UserProfile) -> some View {
        VStack(spacing: 0) {
            // ── Top: avatar + info ──
            HStack(alignment: .top, spacing: 14) {
                ZStack(alignment: .bottomTrailing) {
                    AvatarView(url: profile.avatarUrl, size: 68, showBorder: true)
                    Button {
                        vm.startEditing()
                        showEditProfile = true
                    } label: {
                        Circle()
                            .fill(theme.effectivePrimary)
                            .frame(width: 24, height: 24)
                            .overlay(
                                Image(systemName: "camera.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(.white)
                            )
                    }
                    .offset(x: 2, y: 2)
                }

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(profile.username)
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(theme.effectiveTextColor)
                            .lineLimit(1)
                        Button {
                            vm.startEditing()
                            showEditProfile = true
                        } label: {
                            Image(systemName: "pencil.circle.fill")
                                .font(.system(size: 16))
                                .foregroundColor(theme.effectivePrimary.opacity(0.8))
                        }
                    }

                    if let status = profile.status, !status.isEmpty {
                        Text(status)
                            .font(.system(size: 13))
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                            .lineLimit(1)
                    }

                    // Rating
                    HStack(spacing: 3) {
                        ForEach(1...5, id: \.self) { i in
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundColor(Double(i) <= profile.rating ? .yellow : theme.effectiveSecondaryTextColor.opacity(0.3))
                        }
                        if profile.rating > 0 {
                            Text(String(format: "%.1f", profile.rating))
                                .font(.system(size: 11))
                                .foregroundColor(theme.effectiveSecondaryTextColor)
                        }
                    }

                    // Platform badges
                    HStack(spacing: 5) {
                        ForEach(profile.platforms.compactMap { Platform(rawValue: $0) }, id: \.rawValue) { p in
                            PlatformBadge(platform: p, size: 17)
                        }
                    }
                }
                Spacer()
            }
            .padding(16)

            // ── Per-platform game rows ──
            let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }

            if platforms.isEmpty {
                Text("onboarding.title.platform".localized)
                    .font(.system(size: 13))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .padding()
            } else {
                ForEach(Array(platforms.enumerated()), id: \.1.rawValue) { idx, platform in
                    Divider().padding(.horizontal, 16).background(theme.effectiveBackground.opacity(0.4))
                    profilePlatformRow(
                        platform: platform,
                        games: profile.platformGames[platform.rawValue] ?? [],
                        isTrailing: idx % 2 == 0
                    )
                }
            }
        }
        .background(theme.effectiveCardColor)
        .cornerRadius(20)
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.2), radius: 10, x: 0, y: 4)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
        .onTapGesture {
            vm.startEditing()
            showEditProfile = true
        }
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
                        Text("Tap to add games")
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
            ZStack {
                Circle()
                    .fill(color.opacity(0.18))
                    .overlay(Circle().stroke(color.opacity(0.45), lineWidth: 1))
                Text(String(name.prefix(2)).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(color)
            }
            .frame(width: 44, height: 44)

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
                    HStack(spacing: 12) {
                        Image(systemName: sub.iconName)
                            .foregroundColor(theme.effectivePrimary)
                            .frame(width: 22)
                        Text(sub.name)
                            .font(.system(size: 14))
                            .foregroundColor(theme.effectiveTextColor)
                        Spacer()
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .glass(cornerRadius: 12)
                    .padding(.horizontal, 16)
                }
            }
        }
    }
}

// MARK: - Edit Profile Sheet

struct EditProfileSheet: View {
    @ObservedObject var vm: ProfileViewModel
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager
    @Environment(\.dismiss) private var dismiss
    @State private var editPhotoItem: PhotosPickerItem?

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Avatar
                        VStack(spacing: 10) {
                            ZStack(alignment: .bottomTrailing) {
                                Group {
                                    if let img = vm.editAvatar {
                                        Image(uiImage: img).resizable().scaledToFill()
                                    } else {
                                        AvatarView(url: vm.profile?.avatarUrl, size: 90)
                                    }
                                }
                                .frame(width: 90, height: 90)
                                .clipShape(Circle())

                                Circle()
                                    .fill(theme.effectivePrimary)
                                    .frame(width: 26, height: 26)
                                    .overlay(Image(systemName: "camera.fill").font(.system(size: 11)).foregroundColor(.white))
                            }

                            PhotosPicker(selection: $editPhotoItem, matching: .images) {
                                Text("profile.change.avatar".localized)
                                    .font(.system(size: 14))
                                    .foregroundColor(theme.effectivePrimary)
                            }
                            .onChange(of: editPhotoItem) { item in
                                Task {
                                    if let data = try? await item?.loadTransferable(type: Data.self),
                                       let img = UIImage(data: data) {
                                        vm.editAvatar = img
                                    }
                                }
                            }
                        }
                        .padding(.top, 8)

                        // Username
                        editField(title: "Username") {
                            HStack {
                                Image(systemName: "at").foregroundColor(theme.effectiveSecondaryTextColor)
                                TextField("Username", text: $vm.editUsername)
                                    .foregroundColor(theme.effectiveTextColor)
                                    .autocapitalization(.none)
                            }
                            .padding()
                            .glass(cornerRadius: 14)
                        }

                        // Status
                        editField(title: "Status") {
                            HStack {
                                Image(systemName: "number").foregroundColor(theme.effectiveSecondaryTextColor)
                                TextField("profile.status.placeholder".localized, text: $vm.editStatus)
                                    .foregroundColor(theme.effectiveTextColor)
                            }
                            .padding()
                            .glass(cornerRadius: 14)
                        }

                        // Platforms
                        editField(title: "profile.platforms".localized) {
                            VStack(spacing: 8) {
                                ForEach(Platform.allCases, id: \.rawValue) { platform in
                                    let selected = vm.editPlatforms.contains(platform)
                                    Button {
                                        if selected {
                                            vm.editPlatforms.remove(platform)
                                            if vm.editActiveGamePlatform == platform {
                                                vm.editActiveGamePlatform = vm.editPlatforms.first
                                            }
                                        } else {
                                            vm.editPlatforms.insert(platform)
                                            if vm.editActiveGamePlatform == nil { vm.editActiveGamePlatform = platform }
                                        }
                                    } label: {
                                        HStack(spacing: 12) {
                                            PlatformBadge(platform: platform, size: 28)
                                            Text(platform.rawValue)
                                                .font(.system(size: 14))
                                                .foregroundColor(theme.effectiveTextColor)
                                                .lineLimit(1)
                                            Spacer()
                                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                                .foregroundColor(selected ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                                        }
                                        .padding(12)
                                        .glass(cornerRadius: 12)
                                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? theme.effectivePrimary : Color.clear, lineWidth: 1.5))
                                    }
                                }
                            }
                        }

                        // Games per platform
                        if !vm.editPlatforms.isEmpty {
                            gamesEditor
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("cancel".localized) {
                        vm.cancelEditing()
                        dismiss()
                    }
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await vm.saveChanges(); dismiss() }
                    } label: {
                        if vm.isLoading {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Text("save".localized).foregroundColor(theme.effectivePrimary)
                        }
                    }
                    .disabled(vm.isLoading)
                }
            }
        }
    }

    // MARK: - Games Editor

    private var gamesEditor: some View {
        let sortedPlatforms = Platform.allCases.filter { vm.editPlatforms.contains($0) }
        return editField(title: "profile.games".localized) {
            VStack(spacing: 12) {
                // Platform tabs
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(sortedPlatforms, id: \.rawValue) { platform in
                            let isActive = vm.editActiveGamePlatform == platform
                            Button { vm.editActiveGamePlatform = platform } label: {
                                HStack(spacing: 6) {
                                    PlatformBadge(platform: platform, size: 18)
                                    Text(platform.rawValue)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(isActive ? .white : theme.effectiveTextColor)
                                        .lineLimit(1)
                                }
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(
                                    isActive
                                        ? LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .leading, endPoint: .trailing)
                                        : LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor], startPoint: .leading, endPoint: .trailing)
                                )
                                .cornerRadius(20)
                            }
                        }
                    }
                }

                if let activePlatform = vm.editActiveGamePlatform {
                    // Search field
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                        TextField("onboarding.games.search".localized, text: $vm.gameSearchQuery)
                            .foregroundColor(theme.effectiveTextColor)
                            .autocapitalization(.none)
                            .onChange(of: vm.gameSearchQuery) { vm.searchGames($0) }
                        if !vm.gameSearchQuery.isEmpty {
                            Button { vm.gameSearchQuery = "" } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(theme.effectiveSecondaryTextColor)
                            }
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .glass(cornerRadius: 12)

                    // Selected games chips
                    let selected = vm.editGamesByPlatform[activePlatform] ?? []
                    if !selected.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(selected) { tag in
                                    Button { vm.toggleGame(tag, for: activePlatform) } label: {
                                        HStack(spacing: 6) {
                                            Text(tag.name)
                                                .font(.system(size: 13))
                                                .foregroundColor(.white)
                                                .lineLimit(1)
                                            Image(systemName: "xmark")
                                                .font(.system(size: 10, weight: .bold))
                                                .foregroundColor(.white.opacity(0.8))
                                        }
                                        .padding(.horizontal, 12).padding(.vertical, 7)
                                        .background(activePlatform.color.opacity(0.85))
                                        .cornerRadius(16)
                                    }
                                }
                            }
                        }
                    }

                    // Search results
                    if vm.isSearchingGames {
                        HStack { Spacer(); ProgressView().tint(theme.effectivePrimary); Spacer() }
                    } else if !vm.gameSearchQuery.isEmpty {
                        if vm.gameSearchResults.isEmpty {
                            Text("No results — check RAWG_API_KEY in Secrets.xcconfig")
                                .font(.system(size: 12))
                                .foregroundColor(theme.effectiveSecondaryTextColor)
                                .padding(.top, 4)
                        } else {
                            VStack(spacing: 6) {
                                ForEach(vm.gameSearchResults.prefix(5)) { tag in
                                    let isAdded = (vm.editGamesByPlatform[activePlatform] ?? []).contains { $0.name == tag.name }
                                    Button { vm.toggleGame(tag, for: activePlatform) } label: {
                                        HStack(spacing: 12) {
                                            if let url = tag.coverUrl {
                                                AsyncImageView(url: url)
                                                    .frame(width: 44, height: 30)
                                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                            } else {
                                                RoundedRectangle(cornerRadius: 6)
                                                    .fill(theme.effectiveCardColor)
                                                    .frame(width: 44, height: 30)
                                            }
                                            Text(tag.name)
                                                .font(.system(size: 14))
                                                .foregroundColor(theme.effectiveTextColor)
                                                .lineLimit(1)
                                            Spacer()
                                            Image(systemName: isAdded ? "checkmark.circle.fill" : "plus.circle")
                                                .foregroundColor(isAdded ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                                        }
                                        .padding(.horizontal, 12).padding(.vertical, 8)
                                        .glass(cornerRadius: 12)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func editField(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
            content()
        }
    }
}

// MARK: - Settings Sheet

struct SettingsSheet: View {
    @ObservedObject var vm: ProfileViewModel
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()
                List {
                    Section("Color Theme") {
                        ForEach(CardColorTheme.all) { ct in
                            Button {
                                theme.setCardColor(ct)
                            } label: {
                                HStack {
                                    Circle().fill(ct.primary).frame(width: 24, height: 24)
                                    Text(ct.name).foregroundColor(theme.effectiveTextColor)
                                    Spacer()
                                    if theme.currentCardColor.id == ct.id {
                                        Image(systemName: "checkmark").foregroundColor(theme.effectivePrimary)
                                    }
                                }
                            }
                            .listRowBackground(theme.effectiveCardColor)
                        }
                    }
                    Section("App Theme") {
                        ForEach(AppTheme.allCases, id: \.rawValue) { appTheme in
                            Button {
                                theme.setTheme(appTheme)
                            } label: {
                                HStack {
                                    Text(appTheme.displayName).foregroundColor(theme.effectiveTextColor)
                                    Spacer()
                                    if theme.currentTheme == appTheme {
                                        Image(systemName: "checkmark").foregroundColor(theme.effectivePrimary)
                                    }
                                }
                            }
                            .listRowBackground(theme.effectiveCardColor)
                        }
                    }
                    Section("Language") {
                        ForEach([("ru", "Русский"), ("en", "English"), ("uk", "Українська"), ("be", "Беларуская")], id: \.0) { code, name in
                            Button {
                                localization.setLanguage(code)
                            } label: {
                                HStack {
                                    Text(name).foregroundColor(theme.effectiveTextColor)
                                    Spacer()
                                    if localization.currentLanguage == code {
                                        Image(systemName: "checkmark").foregroundColor(theme.effectivePrimary)
                                    }
                                }
                            }
                            .listRowBackground(theme.effectiveCardColor)
                        }
                    }
                    Section {
                        Button(role: .destructive) {
                            try? vm.signOut()
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                Text("profile.logout".localized)
                            }
                        }
                        .listRowBackground(theme.effectiveCardColor)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("profile.settings".localized)
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
