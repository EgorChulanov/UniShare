import SwiftUI

struct ProductTransparencyView: View {
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        List {
            Section {
                featureRow(icon: "rectangle.stack.fill", title: "transparency.feed.title".localized, detail: "transparency.feed.detail".localized)
                featureRow(icon: "message.fill", title: "transparency.chat.title".localized, detail: "transparency.chat.detail".localized)
                featureRow(icon: "antenna.radiowaves.left.and.right", title: "transparency.airshare.title".localized, detail: "transparency.airshare.detail".localized)
                featureRow(icon: "person.crop.circle.fill", title: "transparency.profile.title".localized, detail: "transparency.profile.detail".localized)
            } header: {
                Text("transparency.features".localized)
            }

            Section {
                Label("transparency.not.marketplace".localized, systemImage: "checkmark.shield.fill")
                Label("transparency.no.credentials".localized, systemImage: "key.slash.fill")
                Label("transparency.report".localized, systemImage: "exclamationmark.bubble.fill")
            } header: {
                Text("transparency.safety".localized)
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.effectiveBackground)
        .navigationTitle("transparency.title".localized)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("settings.productTransparency")
    }

    private func featureRow(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(theme.effectivePrimary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(theme.effectiveTextColor)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
            }
        }
        .padding(.vertical, 4)
    }
}
