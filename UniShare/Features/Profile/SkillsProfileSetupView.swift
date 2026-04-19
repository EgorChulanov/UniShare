import SwiftUI
import PhotosUI

struct SkillsProfileSetupView: View {
    let existingProfile: UserProfile
    let onComplete: (UserProfile) -> Void

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss

    @State private var step = 0
    @State private var selectedSkills: Set<String> = []
    @State private var customSkill = ""
    @State private var description = ""
    @State private var portfolioPhotos: [UIImage] = []
    @State private var photoPickerItems: [PhotosPickerItem] = []
    @State private var isSaving = false

    private let suggestedSkills = [
        "Game Design", "Unity Dev", "Unreal Engine", "3D Art", "2D Art",
        "Pixel Art", "Animation", "Streaming", "Video Editing", "Coaching",
        "Community Manager", "Speedrunner", "Competitive", "Game Testing",
        "Sound Design", "Concept Art", "Narrative Design", "VR/AR"
    ]

    private let steps = ["Навыки", "О себе", "Портфолио", "Готово"]

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()
                GrainOverlay(opacity: 0.14)

                VStack(spacing: 0) {
                    // Progress bar
                    progressBar
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                        .padding(.bottom, 24)

                    // Step content
                    Group {
                        switch step {
                        case 0: skillsStep
                        case 1: descriptionStep
                        case 2: portfolioStep
                        default: confirmStep
                        }
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))

                    Spacer()

                    // Navigation buttons
                    navButtons
                        .padding(.horizontal, 24)
                        .padding(.bottom, 40)
                }
            }
            .navigationTitle("Анкета навыков")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Отмена") { dismiss() }
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
            }
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        HStack(spacing: 6) {
            ForEach(0..<steps.count, id: \.self) { i in
                Capsule()
                    .fill(i <= step ? theme.effectivePrimary : theme.effectiveCardColor)
                    .frame(height: 4)
                    .animation(.easeInOut(duration: 0.3), value: step)
            }
        }
    }

    // MARK: - Step 0: Skills Selection

    private var skillsStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Какие у тебя навыки?")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(theme.effectiveTextColor)
                    Text("Выбери всё что подходит. Другие смогут найти тебя по ним.")
                        .font(.system(size: 14))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
                .padding(.horizontal, 24)

                FlowLayout(spacing: 10) {
                    ForEach(suggestedSkills, id: \.self) { skill in
                        let selected = selectedSkills.contains(skill)
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                if selected { selectedSkills.remove(skill) }
                                else { selectedSkills.insert(skill) }
                            }
                            HapticsManager.shared.impact(.light)
                        } label: {
                            Text(skill)
                                .font(.system(size: 14, weight: selected ? .semibold : .regular))
                                .foregroundColor(selected ? .white : theme.effectiveTextColor)
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .background(selected
                                    ? LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                                     startPoint: .leading, endPoint: .trailing)
                                    : LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor],
                                                     startPoint: .leading, endPoint: .trailing))
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(
                                    selected ? Color.clear : theme.effectiveSecondaryTextColor.opacity(0.3),
                                    lineWidth: 1
                                ))
                                .scaleEffect(selected ? 1.04 : 1.0)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)

                // Custom skill input
                HStack(spacing: 10) {
                    TextField("Добавить свой навык...", text: $customSkill)
                        .font(.system(size: 14))
                        .foregroundColor(theme.effectiveTextColor)
                        .accentColor(theme.effectivePrimary)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(theme.effectiveCardColor)
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    if !customSkill.trimmingCharacters(in: .whitespaces).isEmpty {
                        Button {
                            let s = customSkill.trimmingCharacters(in: .whitespaces)
                            selectedSkills.insert(s)
                            customSkill = ""
                            HapticsManager.shared.impact(.light)
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 26))
                                .foregroundColor(theme.effectivePrimary)
                        }
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .padding(.horizontal, 24)
                .animation(.easeInOut(duration: 0.2), value: customSkill.isEmpty)
            }
            .padding(.bottom, 20)
        }
    }

    // MARK: - Step 1: Description

    private var descriptionStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Расскажи о себе")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(theme.effectiveTextColor)
                Text("Кратко опиши свой опыт и чем ты можешь помочь другим.")
                    .font(.system(size: 14))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }

            TextEditor(text: $description)
                .font(.system(size: 15))
                .foregroundColor(theme.effectiveTextColor)
                .accentColor(theme.effectivePrimary)
                .scrollContentBackground(.hidden)
                .padding(14)
                .frame(height: 180)
                .background(theme.effectiveCardColor)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(
                    theme.effectiveSecondaryTextColor.opacity(0.2), lineWidth: 1
                ))

            if description.isEmpty {
                Text("Например: «Играю в FIFA 5 лет, могу обучить основам, знаю все тактики»")
                    .font(.system(size: 13))
                    .foregroundColor(theme.effectiveSecondaryTextColor.opacity(0.6))
            }
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Step 2: Portfolio photos

    private var portfolioStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Портфолио")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(theme.effectiveTextColor)
                Text("Добавь скриншоты работ, стримов или игровых достижений.")
                    .font(.system(size: 14))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }
            .padding(.horizontal, 24)

            // Photo grid
            if !portfolioPhotos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(portfolioPhotos.enumerated()), id: \.0) { idx, img in
                            ZStack(alignment: .topTrailing) {
                                Image(uiImage: img)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 110, height: 110)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))

                                Button {
                                    portfolioPhotos.remove(at: idx)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 20))
                                        .foregroundColor(.white)
                                        .shadow(radius: 3)
                                }
                                .offset(x: 4, y: -4)
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                }
            }

            // Photo picker
            PhotosPicker(
                selection: $photoPickerItems,
                maxSelectionCount: 6,
                matching: .images
            ) {
                HStack(spacing: 10) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.system(size: 18))
                        .foregroundColor(theme.effectivePrimary)
                    Text(portfolioPhotos.isEmpty ? "Добавить фото" : "Добавить ещё")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.effectiveTextColor)
                    Spacer()
                    Text("\(portfolioPhotos.count)/6")
                        .font(.system(size: 13))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
                .padding(16)
                .background(theme.effectiveCardColor)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(theme.effectivePrimary.opacity(0.3), lineWidth: 1))
            }
            .padding(.horizontal, 24)
            .onChange(of: photoPickerItems) { items in
                Task {
                    var images: [UIImage] = []
                    for item in items {
                        if let data = try? await item.loadTransferable(type: Data.self),
                           let img = UIImage(data: data) {
                            images.append(img)
                        }
                    }
                    portfolioPhotos = images
                    photoPickerItems = []
                }
            }

            Text("Фото помогут другим лучше понять твои навыки и опыт.")
                .font(.system(size: 12))
                .foregroundColor(theme.effectiveSecondaryTextColor.opacity(0.7))
                .padding(.horizontal, 24)
        }
    }

    // MARK: - Step 3: Confirm

    private var confirmStep: some View {
        VStack(spacing: 24) {
            // Skills preview
            if !selectedSkills.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Твои навыки")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                        .padding(.horizontal, 24)

                    FlowLayout(spacing: 8) {
                        ForEach(Array(selectedSkills), id: \.self) { skill in
                            Text(skill)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white)
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .background(LinearGradient(
                                    colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                    startPoint: .leading, endPoint: .trailing))
                                .clipShape(Capsule())
                        }
                    }
                    .padding(.horizontal, 24)
                }
            }

            if !description.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("О себе")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                    Text(description)
                        .font(.system(size: 14))
                        .foregroundColor(theme.effectiveTextColor)
                        .padding(14)
                        .background(theme.effectiveCardColor)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal, 24)
            }

            Text("После сохранения твоя анкета появится в поиске навыков для других пользователей.")
                .font(.system(size: 13))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }

    // MARK: - Navigation Buttons

    private var navButtons: some View {
        HStack(spacing: 14) {
            if step > 0 {
                Button {
                    withAnimation { step -= 1 }
                } label: {
                    Text("Назад")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.effectiveTextColor)
                        .frame(maxWidth: .infinity).frame(height: 52)
                        .background(theme.effectiveCardColor)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }

            Button {
                if step < steps.count - 1 {
                    withAnimation { step += 1 }
                } else {
                    Task { await saveAndFinish() }
                }
            } label: {
                ZStack {
                    if isSaving {
                        ProgressView().tint(.white)
                    } else {
                        Text(step < steps.count - 1 ? "Далее" : "Сохранить")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
                .frame(maxWidth: .infinity).frame(height: 52)
                .background(LinearGradient(
                    colors: canProceed ? [theme.effectivePrimary, theme.effectiveTertiary] : [theme.effectiveCardColor, theme.effectiveCardColor],
                    startPoint: .leading, endPoint: .trailing))
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .disabled(!canProceed || isSaving)
        }
    }

    private var canProceed: Bool {
        switch step {
        case 0: return !selectedSkills.isEmpty
        default: return true
        }
    }

    // MARK: - Save

    private func saveAndFinish() async {
        isSaving = true
        var updated = existingProfile
        updated.skills = Array(selectedSkills)
        updated.skillsDescription = description.isEmpty ? nil : description
        updated.hasSkillsProfile = true

        let data: [String: AnyEncodable] = [
            "skills": AnyEncodable(updated.skills),
            "skills_description": AnyEncodable(updated.skillsDescription ?? ""),
            "has_skills_profile": AnyEncodable(true)
        ]
        try? await AppEnvironment.shared.db.updateUser(uid: existingProfile.uid, data: data)
        isSaving = false
        onComplete(updated)
        dismiss()
    }
}
