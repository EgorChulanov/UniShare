import SwiftUI
import PhotosUI

struct OnboardingView: View {
    var onComplete: () -> Void

    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: OnboardingViewModel

    init(onComplete: @escaping () -> Void) {
        self.onComplete = onComplete
        _vm = StateObject(wrappedValue: OnboardingViewModel(
            auth: FirebaseAuthService(),
            firestore: FirestoreService(),
            storage: StorageService(),
            rawg: RawgService()
        ))
    }

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Progress indicator
                progressBar

                // Step content
                ScrollView {
                    VStack(spacing: 24) {
                        stepTitle
                        stepContent
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 24)
                }

                // Navigation
                navigationButtons
            }
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        HStack(spacing: 6) {
            ForEach(OnboardingStep.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(step.rawValue <= vm.currentStep.rawValue ? theme.effectivePrimary : theme.effectiveCardColor)
                    .frame(height: 4)
                    .animation(.easeInOut, value: vm.currentStep)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Step Title

    private var stepTitle: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(titleForStep(vm.currentStep))
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(theme.effectiveTextColor)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func titleForStep(_ step: OnboardingStep) -> String {
        switch step {
        case .username: return "onboarding.title.username".localized
        case .avatar: return "onboarding.title.avatar".localized
        case .platform: return "onboarding.title.platform".localized
        case .games: return "onboarding.title.games".localized
        case .skills: return "onboarding.title.skills".localized
        case .subscriptions: return "onboarding.title.subscriptions".localized
        }
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        switch vm.currentStep {
        case .username:
            usernameStep
        case .avatar:
            AvatarPickerView(selectedImage: $vm.selectedAvatar)
        case .platform:
            platformStep
        case .games:
            GameSearchPickerView(
                selectedGames: $vm.selectedGames,
                searchQuery: $vm.gameSearchQuery,
                searchResults: vm.gameSearchResults,
                isSearching: vm.isSearchingGames,
                onSearch: { vm.searchGames($0) }
            )
        case .skills:
            skillsStep
        case .subscriptions:
            subscriptionsStep
        }
    }

    // MARK: - Username Step

    private var usernameStep: some View {
        VStack(spacing: 16) {
            HStack {
                Image(systemName: "at")
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                TextField("onboarding.username.placeholder".localized, text: $vm.username)
                    .foregroundColor(theme.effectiveTextColor)
                    .accentColor(theme.effectivePrimary)
                    .autocapitalization(.none)
            }
            .padding()
            .glass(cornerRadius: 14)
            .animatedGradientBorder(cornerRadius: 14, lineWidth: vm.username.count >= 3 ? 2 : 0)

            if vm.username.count > 0 && vm.username.count < 3 {
                Text("Min. 3 characters")
                    .font(.system(size: 13))
                    .foregroundColor(theme.effectivePrimary)
            }
        }
    }

    // MARK: - Platform Step

    private var platformStep: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            ForEach(Platform.allCases, id: \.rawValue) { platform in
                let selected = vm.selectedPlatforms.contains(platform)
                Button {
                    HapticsManager.shared.impact(.light)
                    if selected { vm.selectedPlatforms.remove(platform) }
                    else { vm.selectedPlatforms.insert(platform) }
                } label: {
                    HStack(spacing: 12) {
                        PlatformBadge(platform: platform, size: 36)
                        Text(platform.rawValue)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.effectiveTextColor)
                        Spacer()
                        if selected {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(theme.effectivePrimary)
                        }
                    }
                    .padding(12)
                    .glass(cornerRadius: 14)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(selected ? theme.effectivePrimary : Color.clear, lineWidth: 2)
                    )
                }
            }
        }
    }

    // MARK: - Skills Step

    private var skillsStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                TextField("onboarding.skills.placeholder".localized, text: $vm.skillInput)
                    .foregroundColor(theme.effectiveTextColor)
                    .accentColor(theme.effectivePrimary)
                    .onSubmit { vm.addSkill() }

                Button {
                    vm.addSkill()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .foregroundColor(theme.effectivePrimary)
                        .font(.system(size: 22))
                }
            }
            .padding()
            .glass(cornerRadius: 14)

            FlowLayout(spacing: 8) {
                ForEach(vm.skills, id: \.self) { skill in
                    HStack(spacing: 6) {
                        Text(skill)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(theme.effectiveTextColor)
                        Button {
                            vm.removeSkill(skill)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(theme.effectiveSecondaryTextColor)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(theme.effectivePrimary.opacity(0.2))
                    .cornerRadius(20)
                }
            }
        }
    }

    // MARK: - Subscriptions Step

    private var subscriptionsStep: some View {
        VStack(spacing: 10) {
            ForEach(LocalUserSubscription.available) { sub in
                let selected = vm.selectedSubscriptions.contains(sub.name)
                Button {
                    HapticsManager.shared.impact(.light)
                    if selected { vm.selectedSubscriptions.remove(sub.name) }
                    else { vm.selectedSubscriptions.insert(sub.name) }
                } label: {
                    HStack {
                        Image(systemName: sub.iconName)
                            .foregroundColor(theme.effectivePrimary)
                            .frame(width: 28)
                        Text(sub.name)
                            .font(.system(size: 15))
                            .foregroundColor(theme.effectiveTextColor)
                        Spacer()
                        if selected {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(theme.effectivePrimary)
                        }
                    }
                    .padding()
                    .glass(cornerRadius: 14)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(selected ? theme.effectivePrimary : Color.clear, lineWidth: 1.5)
                    )
                }
            }
        }
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: 12) {
            if vm.currentStep.rawValue > 0 {
                Button {
                    HapticsManager.shared.impact(.light)
                    vm.goBack()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(theme.effectiveTextColor)
                        .frame(width: 52, height: 52)
                        .glass(cornerRadius: 14)
                }
            }

            Button {
                HapticsManager.shared.impact(.medium)
                if vm.isLastStep {
                    vm.complete(onComplete: onComplete)
                } else {
                    vm.advance()
                }
            } label: {
                ZStack {
                    if vm.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text(vm.isLastStep ? "onboarding.complete".localized : "next".localized)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(
                    vm.canAdvance ?
                    LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .leading, endPoint: .trailing) :
                    LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor], startPoint: .leading, endPoint: .trailing)
                )
                .cornerRadius(14)
            }
            .disabled(!vm.canAdvance || vm.isLoading)

            if vm.currentStep == .games {
                Button("skip".localized) {
                    vm.advance()
                }
                .font(.system(size: 14))
                .foregroundColor(theme.effectiveSecondaryTextColor)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 32)
        .padding(.top, 12)
    }
}

// MARK: - FlowLayout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        var totalHeight: CGFloat = 0
        var currentLineWidth: CGFloat = 0
        var currentLineHeight: CGFloat = 0
        let maxWidth = proposal.width ?? 300

        for size in sizes {
            if currentLineWidth + size.width + (currentLineWidth > 0 ? spacing : 0) > maxWidth {
                totalHeight += currentLineHeight + spacing
                currentLineWidth = size.width
                currentLineHeight = size.height
            } else {
                currentLineWidth += size.width + (currentLineWidth > 0 ? spacing : 0)
                currentLineHeight = max(currentLineHeight, size.height)
            }
        }
        totalHeight += currentLineHeight
        return CGSize(width: proposal.width ?? maxWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        var currentX = bounds.minX
        var currentY = bounds.minY
        var currentLineHeight: CGFloat = 0

        for (index, subview) in subviews.enumerated() {
            let size = sizes[index]
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += currentLineHeight + spacing
                currentLineHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            currentLineHeight = max(currentLineHeight, size.height)
        }
    }
}
