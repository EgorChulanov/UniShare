import SwiftUI
import PhotosUI

struct AvatarPickerView: View {
    @Binding var selectedImage: UIImage?
    @Binding var selectedPresetURL: String?
    let presets: [AvatarPreset]

    @EnvironmentObject var theme: ThemeManager
    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false

    var body: some View {
        VStack(spacing: 24) {
            // Preview
            ZStack {
                if let image = selectedImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else if let selectedPresetURL {
                    AsyncImageView(url: selectedPresetURL)
                } else {
                    Circle()
                        .fill(theme.effectiveCardColor)
                    Image(systemName: "person.fill")
                        .resizable()
                        .scaledToFit()
                        .padding(40)
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
            }
            .frame(width: 140, height: 140)
            .clipShape(Circle())
            .animatedGradientBorder(cornerRadius: 70, lineWidth: 3)

            // Picker
            PhotosPicker(
                selection: $photoItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                HStack(spacing: 8) {
                    Image(systemName: "photo.fill")
                    Text("profile.change.avatar".localized)
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(theme.effectivePrimary)
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .glass(cornerRadius: 14)
            }
            .onChange(of: photoItem) { item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        selectedImage = image
                        selectedPresetURL = nil
                    }
                }
            }

            AvatarCatalogGrid(
                presets: presets,
                selectedURL: selectedPresetURL
            ) { preset in
                selectedImage = nil
                selectedPresetURL = preset.imageUrl
            }

            Text("onboarding.title.avatar".localized)
                .font(.system(size: 13))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

struct AvatarCatalogGrid: View {
    let presets: [AvatarPreset]
    let selectedURL: String?
    let onSelect: (AvatarPreset) -> Void

    @EnvironmentObject private var theme: ThemeManager

    private let categories = ["playstation", "nintendo", "xbox", "pc"]
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 4)

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("profile.avatar.catalog".localized)
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.effectiveTextColor)

            ForEach(categories, id: \.self) { category in
                let items = presets.filter { $0.category == category }
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(categoryTitle(category), systemImage: categoryIcon(category))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.effectiveTextColor)

                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(items) { preset in
                                Button {
                                    HapticsManager.shared.impact(.light)
                                    onSelect(preset)
                                } label: {
                                    AsyncImageView(url: preset.imageUrl)
                                    .frame(height: 68)
                                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                                            .stroke(selectedURL == preset.imageUrl ? theme.effectivePrimary : Color.white.opacity(0.12), lineWidth: selectedURL == preset.imageUrl ? 3 : 1)
                                    }
                                    .overlay(alignment: .topTrailing) {
                                        if preset.isOfficial {
                                            Image(systemName: "checkmark.seal.fill")
                                                .font(.system(size: 15, weight: .bold))
                                                .foregroundStyle(.white, theme.effectivePrimary)
                                                .padding(6)
                                                .accessibilityLabel("profile.avatar.official".localized)
                                        }
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }

            Text("profile.avatar.catalog.disclaimer".localized)
                .font(.system(size: 11))
                .foregroundColor(theme.effectiveSecondaryTextColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func categoryTitle(_ category: String) -> String {
        switch category {
        case "playstation": return "PlayStation"
        case "nintendo": return "Nintendo"
        case "xbox": return "Xbox"
        default: return "PC"
        }
    }

    private func categoryIcon(_ category: String) -> String {
        switch category {
        case "playstation": return "playstation.logo"
        case "xbox": return "xbox.logo"
        case "pc": return "desktopcomputer"
        default: return "gamecontroller.fill"
        }
    }
}
