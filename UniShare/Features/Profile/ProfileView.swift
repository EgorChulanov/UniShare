import SwiftUI
import PhotosUI

struct ProfileView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: ProfileViewModel
    @State private var showEditProfile = false
    @State private var showThemeSettings = false
    @State private var showLanguageSettings = false

    init() {
        _vm = StateObject(wrappedValue: ProfileViewModel(
            auth: FirebaseAuthService(),
            firestore: FirestoreService(),
            storage: StorageService(),
            rawg: RawgService()
        ))
    }

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            if vm.isLoading && vm.profile == nil {
                ProgressView().tint(theme.effectivePrimary)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        profileHeaderSection
                            .padding(.top, 20)

                        profileCardSection
                            .padding(.top, 20)

                        if let profile = vm.profile {
                            platformGamesSections(profile: profile)
                                .padding(.top, 24)

                            if !profile.skills.isEmpty {
                                skillsSection(profile.skills)
                                    .padding(.top, 20)
                            }

                            if !profile.subscriptions.isEmpty {
                                subsSection(profile.subscriptions)
                                    .padding(.top, 20)
                            }
                        }

                        settingsSection
                            .padding(.top, 28)
                            .padding(.bottom, 40)
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
        .sheet(isPresented: $showThemeSettings) {
            NavigationView { ThemeSettingsView() }
                .environmentObject(theme)
                .environmentObject(localization)
        }
        .sheet(isPresented: $showLanguageSettings) {
            NavigationView { LanguageSettingsView() }
                .environmentObject(theme)
                .environmentObject(localization)
        }
    }

    // MARK: - Header

    private var profileHeaderSection: some View {
        VStack(spacing: 12) {
            // Avatar with camera button
            ZStack(alignment: .bottomTrailing) {
                AvatarView(url: vm.profile?.avatarUrl, size: 90, showBorder: true)

                Button {
                    vm.startEditing()
                    showEditProfile = true
                } label: {
                    Circle()
                        .fill(theme.effectivePrimary)
                        .frame(width: 28, height: 28)
                        .overlay(
                            Image(systemName: "camera.fill")
                                .font(.system(size: 12))
                                .foregroundColor(.white)
                        )
                }
                .offset(x: 2, y: 2)
            }

            // Username + pencil
            HStack(spacing: 8) {
                Text(vm.profile?.username ?? "")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(theme.effectiveTextColor)

                Button {
                    vm.startEditing()
                    showEditProfile = true
                } label: {
                    Image(systemName: "pencil.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(theme.effectivePrimary.opacity(0.8))
                }
            }

            if let status = vm.profile?.status, !status.isEmpty {
                Text(status)
                    .font(.system(size: 14))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .multilineTextAlignment(.center)
            }

            ratingRow
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
    }

    private var ratingRow: some View {
        let rating = vm.profile?.rating ?? 0.0
        return Group {
            if rating > 0 {
                HStack(spacing: 4) {
                    ForEach(1...5, id: \.self) { star in
                        Image(systemName: Double(star) <= rating ? "star.fill" : (Double(star) - 0.5 <= rating ? "star.leadinghalf.filled" : "star"))
                            .font(.system(size: 14))
                            .foregroundColor(.yellow)
                    }
                    Text(String(format: "%.1f", rating))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
            } else {
                Text("No ratings yet")
                    .font(.system(size: 13))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }
        }
    }

    // MARK: - Profile Card (feed style)

    private var profileCardSection: some View {
        ZStack(alignment: .bottomLeading) {
            // Background
            Group {
                if let url = vm.profile?.avatarUrl {
                    AsyncImageView(url: url)
                        .frame(maxWidth: .infinity)
                        .clipped()
                } else {
                    LinearGradient(
                        colors: [theme.effectiveTertiary, theme.effectiveCardColor],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    Image(systemName: "person.fill")
                        .resizable()
                        .scaledToFit()
                        .padding(70)
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
            }
            .frame(height: 260)

            // Gradient overlay
            LinearGradient(
                colors: [Color.clear, Color.black.opacity(0.8)],
                startPoint: .center, endPoint: .bottom
            )

            // Info
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(vm.profile?.username ?? "")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                    Spacer()
                    HStack(spacing: 6) {
                        ForEach(vm.profile?.platforms.compactMap { Platform(rawValue: $0) } ?? [], id: \.rawValue) { p in
                            PlatformBadge(platform: p, size: 22)
                        }
                    }
                }

                if let status = vm.profile?.status, !status.isEmpty {
                    Text(status)
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.8))
                        .lineLimit(1)
                }
            }
            .padding(16)
        }
        .frame(height: 260)
        .cornerRadius(20)
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .shadow(color: .black.opacity(0.25), radius: 10, x: 0, y: 4)
        .padding(.horizontal, 16)
    }

    // MARK: - Platform Games

    private func platformGamesSections(profile: UserProfile) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(profile.platforms.compactMap { Platform(rawValue: $0) }, id: \.rawValue) { platform in
                let games = gamesForPlatform(platform, profile: profile)
                if !games.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            PlatformBadge(platform: platform, size: 22)
                            Text(platform.rawValue)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(theme.effectiveTextColor)
                        }
                        .padding(.horizontal, 16)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(games, id: \.self) { gameName in
                                    Text(gameName)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(theme.effectiveTextColor)
                                        .lineLimit(1)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(platform.color.opacity(0.15))
                                        .cornerRadius(16)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 16)
                                                .stroke(platform.color.opacity(0.4), lineWidth: 1)
                                        )
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                }
            }
        }
    }

    private func gamesForPlatform(_ platform: Platform, profile: UserProfile) -> [String] {
        let byPlatform = profile.platformGames[platform.rawValue] ?? []
        if !byPlatform.isEmpty { return byPlatform }
        // Fallback: show all games for the first platform only (old profiles)
        if profile.platforms.first == platform.rawValue { return profile.games }
        return []
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
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
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
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glass(cornerRadius: 12)
                    .padding(.horizontal, 16)
                }
            }
        }
    }

    // MARK: - Settings

    private var settingsSection: some View {
        VStack(spacing: 10) {
            Button { showThemeSettings = true } label: {
                settingsRow(icon: "paintpalette.fill", title: "profile.theme".localized)
            }
            Button { showLanguageSettings = true } label: {
                settingsRow(icon: "globe", title: "profile.language".localized)
            }
            Button { try? vm.signOut() } label: {
                settingsRow(icon: "rectangle.portrait.and.arrow.right", title: "profile.logout".localized, isDestructive: true)
            }
        }
        .padding(.horizontal, 16)
    }

    private func settingsRow(icon: String, title: String, isDestructive: Bool = false) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .foregroundColor(isDestructive ? .red : theme.effectivePrimary)
                .frame(width: 22)
            Text(title)
                .font(.system(size: 15))
                .foregroundColor(isDestructive ? .red : theme.effectiveTextColor)
            Spacer()
            if !isDestructive {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }
        }
        .padding()
        .glass(cornerRadius: 14)
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
                                        if selected { vm.editPlatforms.remove(platform) }
                                        else { vm.editPlatforms.insert(platform) }
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

    private func editField(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
            content()
        }
    }
}

// MARK: - Theme Settings

struct ThemeSettingsView: View {
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    var body: some View {
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
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("profile.theme".localized)
    }
}

// MARK: - Language Settings

struct LanguageSettingsView: View {
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    private let languages = [("ru", "Русский"), ("en", "English"), ("uk", "Українська"), ("be", "Беларуская")]

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()
            List {
                ForEach(languages, id: \.0) { (code, name) in
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
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("profile.language".localized)
    }
}
