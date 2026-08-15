import SwiftUI

// MARK: - Settings Sheet

struct SettingsSheet: View {
    @ObservedObject var vm: ProfileViewModel
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var deletionError: String?

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()
                List {
                    Section("profile.theme".localized) {
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
                    Section("profile.language".localized) {
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
                    Section("settings.about".localized) {
                        Link(destination: AppConstants.Legal.privacyPolicy) {
                            Label("settings.privacy".localized, systemImage: "hand.raised.fill")
                        }
                        .listRowBackground(theme.effectiveCardColor)
                        Link(destination: AppConstants.Legal.terms) {
                            Label("settings.terms".localized, systemImage: "doc.text.fill")
                        }
                        .listRowBackground(theme.effectiveCardColor)
                        Link(destination: AppConstants.Legal.support) {
                            Label("settings.support".localized, systemImage: "envelope.fill")
                        }
                        .listRowBackground(theme.effectiveCardColor)
                    }
                    Section {
                        Button(role: .destructive) {
                            Task { try? await vm.signOut() }
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                Text("profile.logout".localized)
                            }
                        }
                        .listRowBackground(theme.effectiveCardColor)
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            HStack {
                                Image(systemName: "trash.fill")
                                Text("settings.delete.account".localized)
                                Spacer()
                                if isDeleting { ProgressView() }
                            }
                        }
                        .disabled(isDeleting)
                        .accessibilityIdentifier("settings.deleteAccount")
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
            .confirmationDialog(
                "settings.delete.title".localized,
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("settings.delete.confirm".localized, role: .destructive) {
                    isDeleting = true
                    Task {
                        do {
                            try await vm.deleteAccount()
                            dismiss()
                        } catch {
                            deletionError = error.localizedDescription
                            isDeleting = false
                        }
                    }
                }
                .accessibilityIdentifier("settings.confirmDelete")
                Button("settings.delete.cancel".localized, role: .cancel) {}
            } message: {
                Text("settings.delete.message".localized)
            }
            .alert("common.error".localized, isPresented: Binding(
                get: { deletionError != nil },
                set: { if !$0 { deletionError = nil } }
            )) {
                Button("common.ok".localized) { deletionError = nil }
            } message: {
                Text(deletionError ?? "")
            }
        }
    }
}
