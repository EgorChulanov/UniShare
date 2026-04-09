import SwiftUI
import PhotosUI

struct ProfileView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: ProfileViewModel

    init() {
        _vm = StateObject(wrappedValue: ProfileViewModel(
            auth: FirebaseAuthService(),
            firestore: FirestoreService(),
            storage: StorageService(),
            rawg: RawgService()
        ))
    }

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                if vm.isLoading && vm.profile == nil {
                    ProgressView().tint(theme.effectivePrimary)
                } else if vm.isEditing {
                    editView
                } else {
                    displayView
                }
            }
            .navigationTitle("tab.profile".localized)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if !vm.isEditing {
                        Button("profile.edit".localized) {
                            vm.startEditing()
                        }
                        .foregroundColor(theme.effectivePrimary)
                    }
                }
            }
        }
        .task { await vm.load() }
    }

    // MARK: - Display View

    private var displayView: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Avatar + username header
                profileHeader

                if let profile = vm.profile {
                    // Platforms
                    if !profile.platforms.isEmpty {
                        let platforms = profile.platforms.compactMap { Platform(rawValue: $0) }
                        sectionCard(title: "profile.platforms".localized) {
                            PlatformBadgeRow(platforms: platforms, size: 36)
                        }
                    }

                    // Games
                    if !profile.games.isEmpty {
                        sectionCard(title: "profile.games".localized) {
                            GameTagsScrollView(tags: profile.games.map { GameTag(name: $0) })
                        }
                    }

                    // Skills
                    if !profile.skills.isEmpty {
                        sectionCard(title: "profile.skills".localized) {
                            FlowLayout(spacing: 8) {
                                ForEach(profile.skills, id: \.self) { skill in
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

                    // Subscriptions
                    if !profile.subscriptions.isEmpty {
                        sectionCard(title: "profile.subscriptions".localized) {
                            VStack(spacing: 8) {
                                ForEach(profile.subscriptions) { sub in
                                    HStack {
                                        Image(systemName: sub.iconName)
                                            .foregroundColor(theme.effectivePrimary)
                                            .frame(width: 24)
                                        Text(sub.name)
                                            .font(.system(size: 14))
                                            .foregroundColor(theme.effectiveTextColor)
                                        Spacer()
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }

                    // Settings section
                    settingsSection
                }
            }
            .padding(.bottom, 32)
        }
    }

    private var profileHeader: some View {
        VStack(spacing: 12) {
            let avatarUrl = vm.profile?.avatarUrl
            AvatarView(url: avatarUrl, size: 90, showBorder: true)

            Text(vm.profile?.username ?? "")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(theme.effectiveTextColor)

            if let status = vm.profile?.status, !status.isEmpty {
                Text(status)
                    .font(.system(size: 14))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.top, 20)
    }

    private func sectionCard(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 16)

            content()
                .padding(.bottom, 4)
        }
        .padding(.vertical, 16)
        .glass(cornerRadius: 16)
        .padding(.horizontal, 16)
    }

    private var settingsSection: some View {
        VStack(spacing: 12) {
            // Theme picker
            NavigationLink {
                ThemeSettingsView()
            } label: {
                settingsRow(icon: "paintpalette.fill", title: "profile.theme".localized)
            }

            // Language picker
            NavigationLink {
                LanguageSettingsView()
            } label: {
                settingsRow(icon: "globe", title: "profile.language".localized)
            }

            // Sign out
            Button {
                try? vm.signOut()
            } label: {
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
            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(theme.effectiveSecondaryTextColor)
        }
        .padding()
        .glass(cornerRadius: 14)
    }

    // MARK: - Edit View

    private var editView: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Avatar edit
                editAvatarSection

                // Username
                editFieldSection(title: "Username") {
                    HStack {
                        Image(systemName: "at").foregroundColor(theme.effectiveSecondaryTextColor)
                        TextField("Username", text: $vm.editUsername)
                            .foregroundColor(theme.effectiveTextColor)
                            .accentColor(theme.effectivePrimary)
                            .autocapitalization(.none)
                    }
                    .padding()
                    .glass(cornerRadius: 14)
                }

                // Status
                editFieldSection(title: "Status") {
                    HStack {
                        Image(systemName: "number").foregroundColor(theme.effectiveSecondaryTextColor)
                        TextField("profile.status.placeholder".localized, text: $vm.editStatus)
                            .foregroundColor(theme.effectiveTextColor)
                            .accentColor(theme.effectivePrimary)
                    }
                    .padding()
                    .glass(cornerRadius: 14)
                }

                // Platforms
                editFieldSection(title: "profile.platforms".localized) {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(Platform.allCases, id: \.rawValue) { platform in
                            let selected = vm.editPlatforms.contains(platform)
                            Button {
                                if selected { vm.editPlatforms.remove(platform) }
                                else { vm.editPlatforms.insert(platform) }
                            } label: {
                                HStack {
                                    PlatformBadge(platform: platform, size: 28)
                                    Text(platform.rawValue).font(.system(size: 13)).foregroundColor(theme.effectiveTextColor)
                                    Spacer()
                                    if selected { Image(systemName: "checkmark").foregroundColor(theme.effectivePrimary) }
                                }
                                .padding(10)
                                .glass(cornerRadius: 12)
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? theme.effectivePrimary : Color.clear, lineWidth: 1.5))
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                // Save / Cancel
                HStack(spacing: 12) {
                    Button("cancel".localized) {
                        vm.cancelEditing()
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .glass(cornerRadius: 14)
                    .foregroundColor(theme.effectiveTextColor)

                    Button("save".localized) {
                        Task { await vm.saveChanges() }
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .leading, endPoint: .trailing))
                    .foregroundColor(.white)
                    .cornerRadius(14)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
    }

    @State private var editPhotoItem: PhotosPickerItem?

    private var editAvatarSection: some View {
        VStack(spacing: 12) {
            ZStack {
                if let img = vm.editAvatar {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    AvatarView(url: vm.profile?.avatarUrl, size: 90)
                }
            }
            .frame(width: 90, height: 90)
            .clipShape(Circle())
            .animatedGradientBorder(cornerRadius: 45, lineWidth: 2)

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
        .padding(.top, 20)
    }

    private func editFieldSection(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .padding(.horizontal, 16)
            content()
        }
        .padding(.horizontal, 16)
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
