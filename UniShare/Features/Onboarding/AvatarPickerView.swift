import SwiftUI
import PhotosUI

struct AvatarPickerView: View {
    @Binding var selectedImage: UIImage?

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
                    }
                }
            }

            Text("onboarding.title.avatar".localized)
                .font(.system(size: 13))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}
