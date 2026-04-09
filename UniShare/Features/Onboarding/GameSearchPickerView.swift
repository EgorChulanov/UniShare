import SwiftUI

struct GameSearchPickerView: View {
    @Binding var selectedGames: [GameTag]
    @Binding var searchQuery: String
    let searchResults: [GameTag]
    let isSearching: Bool
    let onSearch: (String) -> Void

    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        VStack(spacing: 16) {
            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                TextField("feed.search.placeholder".localized, text: $searchQuery)
                    .foregroundColor(theme.effectiveTextColor)
                    .accentColor(theme.effectivePrimary)
                    .onChange(of: searchQuery) { query in
                        onSearch(query)
                    }
                if isSearching {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(theme.effectivePrimary)
                }
            }
            .padding()
            .glass(cornerRadius: 14)

            // Selected games
            if !selectedGames.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Selected (\(selectedGames.count))")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.effectiveSecondaryTextColor)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(selectedGames) { game in
                                HStack(spacing: 6) {
                                    GameTagView(tag: game)
                                    Button {
                                        selectedGames.removeAll { $0.id == game.id }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(theme.effectivePrimary)
                                            .font(.system(size: 16))
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 4)
                    }
                }
            }

            // Results
            if !searchResults.isEmpty {
                LazyVStack(spacing: 8) {
                    ForEach(searchResults) { game in
                        let isSelected = selectedGames.contains(where: { $0.name == game.name })
                        Button {
                            HapticsManager.shared.impact(.light)
                            if isSelected {
                                selectedGames.removeAll { $0.name == game.name }
                            } else {
                                selectedGames.append(game)
                            }
                        } label: {
                            HStack {
                                GameTagView(tag: game)
                                Spacer()
                                if isSelected {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(theme.effectivePrimary)
                                }
                            }
                            .padding(10)
                            .glass(cornerRadius: 12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(isSelected ? theme.effectivePrimary : Color.clear, lineWidth: 1.5)
                            )
                        }
                    }
                }
            } else if !searchQuery.isEmpty && !isSearching {
                Text("No games found")
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .font(.system(size: 14))
                    .padding(.top, 20)
            }
        }
    }
}
