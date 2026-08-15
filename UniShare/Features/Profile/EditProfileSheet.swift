import SwiftUI
import PhotosUI

// MARK: - Edit Profile Sheet

struct EditProfileSheet: View {
    @ObservedObject var vm: ProfileViewModel
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager
    @Environment(\.dismiss) private var dismiss
    @State private var editPhotoItem: PhotosPickerItem?
    @State private var subscriptionDraft: LocalUserSubscription?

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
                        editField(title: "profile.username".localized) {
                            HStack {
                                Image(systemName: "at").foregroundColor(theme.effectiveSecondaryTextColor)
                                TextField("profile.username".localized, text: $vm.editUsername)
                                    .foregroundColor(theme.effectiveTextColor)
                                    .autocapitalization(.none)
                            }
                            .padding()
                            .glass(cornerRadius: 14)
                        }

                        // Status
                        editField(title: "profile.status".localized) {
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

                        subscriptionsEditor
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("profile.edit".localized)
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
                        Task {
                            if await vm.saveChanges() { dismiss() }
                        }
                    } label: {
                        if vm.isLoading {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Text("save".localized).foregroundColor(theme.effectivePrimary)
                        }
                    }
                    .disabled(vm.isLoading)
                    .disabled(!vm.canSaveChanges)
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
            .sheet(item: $subscriptionDraft) { subscription in
                SubscriptionEditorSheet(subscription: subscription) { updated in
                    vm.updateSubscription(updated)
                } onDelete: {
                    vm.removeSubscription(named: subscription.name)
                }
                .environmentObject(theme)
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
                            Text("game.search.empty".localized)
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

                    VStack(alignment: .leading, spacing: 5) {
                        if !AppEnvironment.shared.rawg.isConfigured {
                            Label("game.search.catalog.unavailable".localized, systemImage: "exclamationmark.triangle")
                                .foregroundStyle(.orange)
                        } else {
                            Link(destination: URL(string: "https://rawg.io")!) {
                                Text("game.search.powered.rawg".localized)
                                    .foregroundStyle(theme.effectiveSecondaryTextColor)
                            }
                        }
                        Text("game.search.custom.hint".localized)
                            .foregroundColor(theme.effectiveSecondaryTextColor)
                    }
                    .font(.system(size: 11))
                }
            }
        }
    }

    private var subscriptionsEditor: some View {
        editField(title: "profile.subscriptions".localized) {
            VStack(spacing: 8) {
                ForEach(LocalUserSubscription.available) { subscription in
                    let selected = vm.editSubscriptions.contains { $0.name == subscription.name }
                    Button {
                        if let existing = vm.editSubscriptions.first(where: { $0.name == subscription.name }) {
                            subscriptionDraft = existing
                        } else {
                            vm.updateSubscription(subscription)
                            subscriptionDraft = subscription
                        }
                        HapticsManager.shared.impact(.light)
                    } label: {
                        HStack(spacing: 12) {
                            BrandIcon(assetName: subscription.brandAssetName, systemName: subscription.iconName)
                                .foregroundStyle(theme.effectivePrimary)
                                .frame(width: 22, height: 22)
                                .frame(width: 26)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(subscription.name)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(theme.effectiveTextColor)
                                    .lineLimit(1)
                                if let existing = vm.editSubscriptions.first(where: { $0.name == subscription.name }),
                                   let summary = subscriptionSummary(existing) {
                                    Text(summary)
                                        .font(.system(size: 11))
                                        .foregroundStyle(theme.effectiveSecondaryTextColor)
                                        .lineLimit(1)
                                }
                            }
                            Spacer()
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(selected ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(theme.effectiveCardColor)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(
                                    selected ? theme.effectivePrimary : theme.effectiveTextColor.opacity(0.16),
                                    lineWidth: selected ? 1.5 : 1
                                )
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func subscriptionSummary(_ subscription: LocalUserSubscription) -> String? {
        if let plan = subscription.planName, !plan.isEmpty { return plan }
        if let date = subscription.expiresAt {
            return String(format: "subscription.expires".localized, date.formatted(date: .abbreviated, time: .omitted))
        }
        return nil
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

private struct SubscriptionEditorSheet: View {
    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @State private var draft: LocalUserSubscription
    let onSave: (LocalUserSubscription) -> Void
    let onDelete: () -> Void

    init(
        subscription: LocalUserSubscription,
        onSave: @escaping (LocalUserSubscription) -> Void,
        onDelete: @escaping () -> Void
    ) {
        _draft = State(initialValue: subscription)
        self.onSave = onSave
        self.onDelete = onDelete
    }

    private var definition: SubscriptionDefinition? { draft.definition }

    private var selectedPlan: SubscriptionPlanOption? {
        definition?.plan(named: draft.planName)
    }

    private var availableCycles: [SubscriptionBillingCycle] {
        selectedPlan?.cycles ?? [.month]
    }

    private var selectedCycle: SubscriptionBillingCycle {
        availableCycles.first(where: { $0.id == draft.billingCycleId }) ?? availableCycles[0]
    }

    var body: some View {
        NavigationView {
            Form {
                Section {
                    HStack(spacing: 12) {
                        BrandIcon(assetName: draft.brandAssetName, systemName: draft.iconName)
                            .foregroundStyle(theme.effectivePrimary)
                            .frame(width: 28, height: 28)
                        Text(draft.name).font(.headline)
                    }
                }

                if let definition {
                    Section("subscription.details".localized) {
                        Picker("subscription.plan".localized, selection: planBinding) {
                            ForEach(definition.plans) { plan in
                                Text(plan.name).tag(plan.name)
                            }
                        }

                        Picker("subscription.period".localized, selection: cycleBinding) {
                            ForEach(availableCycles) { cycle in
                                Text(cycle.localizedTitle).tag(cycle.id)
                            }
                        }
                    }
                }

                Section("subscription.duration".localized) {
                    DatePicker(
                        "subscription.started".localized,
                        selection: startDateBinding,
                        displayedComponents: .date
                    )
                    DatePicker(
                        "subscription.expiry".localized,
                        selection: expiryDateBinding,
                        in: startDateBinding.wrappedValue...,
                        displayedComponents: .date
                    )
                    Toggle("subscription.auto.renew".localized, isOn: autoRenewBinding)

                }

                if let progress = draft.remainingFraction, let days = draft.daysRemaining {
                    Section("subscription.remaining".localized) {
                        ProgressView(value: progress)
                            .tint(theme.effectivePrimary)
                        Text(String(format: "subscription.days.remaining".localized, days))
                            .font(.footnote)
                            .foregroundStyle(theme.effectiveSecondaryTextColor)
                    }
                }

                Section {
                    Button("subscription.remove".localized, role: .destructive) {
                        onDelete()
                        dismiss()
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.effectiveBackground)
            .navigationTitle("subscription.edit".localized)
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { normalizeDraft(recalculateExpiry: draft.expiresAt == nil) }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("cancel".localized) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("save".localized) {
                        onSave(draft)
                        dismiss()
                    }
                }
            }
        }
    }

    private var planBinding: Binding<String> {
        Binding(
            get: { selectedPlan?.name ?? "" },
            set: { value in
                draft.planName = value
                normalizeDraft(recalculateExpiry: true)
            }
        )
    }

    private var cycleBinding: Binding<String> {
        Binding(
            get: { selectedCycle.id },
            set: { value in
                draft.billingCycleId = value
                recalculateExpiry()
            }
        )
    }

    private var startDateBinding: Binding<Date> {
        Binding(
            get: { draft.startedAt ?? Date() },
            set: { value in
                draft.startedAt = value
                recalculateExpiry()
            }
        )
    }

    private var expiryDateBinding: Binding<Date> {
        Binding(
            get: { draft.expiresAt ?? Calendar.current.date(byAdding: .day, value: selectedCycle.days, to: startDateBinding.wrappedValue)! },
            set: { draft.expiresAt = $0 }
        )
    }

    private var autoRenewBinding: Binding<Bool> {
        Binding(get: { draft.autoRenew ?? false }, set: { draft.autoRenew = $0 })
    }

    private func normalizeDraft(recalculateExpiry: Bool) {
        guard let definition else { return }
        let plan = definition.plan(named: draft.planName)
        draft.planName = plan.name
        if !plan.cycles.contains(where: { $0.id == draft.billingCycleId }) {
            draft.billingCycleId = plan.cycles[0].id
        }
        draft.startedAt = draft.startedAt ?? Date()
        draft.autoRenew = draft.autoRenew ?? false
        draft.url = nil
        draft.details = nil
        draft.sharedSlots = nil
        if recalculateExpiry { self.recalculateExpiry() }
    }

    private func recalculateExpiry() {
        let start = draft.startedAt ?? Date()
        draft.startedAt = start
        draft.expiresAt = Calendar.current.date(byAdding: .day, value: selectedCycle.days, to: start)
    }
}
