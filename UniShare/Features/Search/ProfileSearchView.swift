import SwiftUI

@MainActor
final class ProfileSearchViewModel: ObservableObject {
    @Published var query = ""
    @Published private(set) var results: [UserProfile] = []
    @Published private(set) var isLoading = false
    @Published private(set) var popularGames: [RawgGame] = []
    @Published var errorMessage: String?

    private let database: SupabaseService
    private let rawg: RawgService
    private var task: Task<Void, Never>?

    init(
        database: SupabaseService = AppEnvironment.shared.db,
        rawg: RawgService = AppEnvironment.shared.rawg
    ) {
        self.database = database
        self.rawg = rawg
    }

    func scheduleSearch() {
        task?.cancel()
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard term.count >= 2 else {
            results = []
            isLoading = false
            return
        }

        task = Task {
            try? await Task.sleep(for: .milliseconds(320))
            guard !Task.isCancelled else { return }
            isLoading = true
            defer { isLoading = false }
            do {
                results = try await database.searchProfiles(query: term)
            } catch is CancellationError {
                return
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func loadPopularGames() async {
        guard popularGames.isEmpty else { return }
#if DEBUG
        if ProcessInfo.processInfo.environment["UNISHARE_UI_CATALOG"] == "search" {
            let names = [
                "Fortnite", "Minecraft", "GTA V", "Cyberpunk 2077", "Elden Ring",
                "The Last of Us", "Mario Kart", "Zelda", "Counter-Strike 2", "Valorant",
                "Baldur's Gate 3", "Helldivers 2", "Forza Horizon 5", "God of War", "Diablo IV",
                "Hades", "Resident Evil 4", "Alan Wake 2", "Apex Legends", "Overwatch 2",
                "Sea of Thieves", "Hogwarts Legacy", "Dota 2", "Destiny 2", "Warframe",
                "Stardew Valley", "Terraria", "No Man's Sky", "Death Stranding", "Control"
            ]
            popularGames = names.enumerated().map { RawgGame(id: 90_000 + $0.offset, name: $0.element) }
            return
        }
#endif
        popularGames = await rawg.popularGames()
    }

    deinit { task?.cancel() }
}

struct ProfileSearchView: View {
    @EnvironmentObject private var theme: ThemeManager
    @StateObject private var model = ProfileSearchViewModel()
    @State private var selectedProfile: UserProfile?
    @State private var selectedGame: RawgGame?
    @State private var promptIndex = 0

    var body: some View {
        ZStack {
            BrandBackground()

            VStack(spacing: 14) {
                searchHeader

                Group {
                    if model.isLoading && model.results.isEmpty {
                        Spacer()
                        ProgressView().tint(theme.effectivePrimary)
                        Spacer()
                    } else if model.query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 {
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: 22) {
                                if !model.popularGames.isEmpty {
                                    PopularGamesShelf(games: model.popularGames) { selectedGame = $0 }
                                }
                                SearchDiscoverySection { platform in
                                    model.query = platform.rawValue
                                }
                            }
                            .padding(.bottom, 100)
                        }
                    } else if model.results.isEmpty {
                        SearchEmptyState(
                            icon: "magnifyingglass",
                            title: "search.empty.title".localized,
                            subtitle: String(format: "search.empty.subtitle".localized, model.query)
                        )
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(model.results) { profile in
                                    Button {
                                        selectedProfile = profile
                                        HapticsManager.shared.impact(.light)
                                    } label: {
                                        SearchProfileRow(profile: profile)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                        }
                        .scrollDismissesKeyboard(.interactively)
                    }
                }
            }
        }
        .onChange(of: model.query) { _ in model.scheduleSearch() }
        .task {
            await model.loadPopularGames()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2.4))
                guard !Task.isCancelled else { break }
                withAnimation(.spring(response: 0.44, dampingFraction: 0.82)) {
                    promptIndex = (promptIndex + 1) % promptWords.count
                }
            }
        }
        .sheet(item: $selectedProfile) { profile in
            ProfilePreviewSheet(profile: profile)
                .environmentObject(theme)
        }
        .sheet(item: $selectedGame) { game in
            GameDetailView(game: game)
                .environmentObject(theme)
        }
        .alert("common.error".localized, isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("common.ok".localized, role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private var searchHeader: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 7) {
                Text("search.prompt.prefix".localized)
                Text(promptWords[promptIndex].localized)
                    .foregroundStyle(theme.effectivePrimary)
                    .id(promptIndex)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            .font(.system(size: 29, weight: .black, design: .rounded))
            .foregroundStyle(theme.effectiveTextColor)
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            Text("search.prompt.subtitle".localized)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(theme.effectiveSecondaryTextColor)

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
                TextField("search.placeholder".localized, text: $model.query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundStyle(theme.effectiveTextColor)
                    .accessibilityIdentifier("search.field")
                if !model.query.isEmpty {
                    Button { model.query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(theme.effectiveSecondaryTextColor)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 50)
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: 18, style: .continuous), interactive: true)
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
    }

    private var promptWords: [String] {
        [
            "search.prompt.people",
            "search.prompt.games",
            "search.prompt.platforms",
            "search.prompt.subscriptions",
            "search.prompt.skills"
        ]
    }
}

private struct PopularGamesShelf: View {
    let games: [RawgGame]
    let onSelect: (RawgGame) -> Void
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("search.popular.games".localized)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.effectiveTextColor)
                Spacer()
                Image(systemName: "sparkles")
                    .foregroundStyle(theme.effectivePrimary)
            }
            .padding(.horizontal, 16)

            VStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { row in
                    BrickGameRow(
                        games: games.enumerated().compactMap { $0.offset % 3 == row ? $0.element : nil },
                        row: row,
                        onSelect: onSelect
                    )
                    .offset(x: row == 1 ? 52 : 0)
                }
            }
            .frame(height: 226)
            .clipped()
        }
    }
}

private struct BrickGameRow: View {
    let games: [RawgGame]
    let row: Int
    let onSelect: (RawgGame) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geometry in
            let stride: CGFloat = 126
            let cycleWidth = max(CGFloat(games.count) * stride, stride)
            let repetitions = games.isEmpty ? 0 : max(3, Int(ceil(geometry.size.width / cycleWidth)) + 2)
            let movesForward = row.isMultiple(of: 2)
            let duration = max(Double(cycleWidth / CGFloat(11 + Double(row))), 5)

            TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: reduceMotion)) { timeline in
                let progress = timeline.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: duration) / duration

                HStack(spacing: 10) {
                    ForEach(0..<(games.count * repetitions), id: \.self) { index in
                        let game = games[index % games.count]
                        Button { onSelect(game) } label: {
                            ZStack {
                                CachedRemoteImage(url: game.backgroundImage)
                                LinearGradient(colors: [.clear, .black.opacity(0.78)], startPoint: .center, endPoint: .bottom)
                                Text(game.name)
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundStyle(.white)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 8)
                                    .frame(maxHeight: .infinity, alignment: .bottom)
                                    .padding(.bottom, 9)
                            }
                            .frame(width: 116, height: 68)
                            .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 17, style: .continuous)
                                    .stroke(.white.opacity(0.34), lineWidth: 1)
                            }
                            .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .fixedSize(horizontal: true, vertical: false)
                .offset(x: reduceMotion ? 0 : movesForward
                    ? -cycleWidth * CGFloat(progress)
                    : -cycleWidth + cycleWidth * CGFloat(progress)
                )
            }
        }
        .frame(height: 68)
    }
}

private struct SearchDiscoverySection: View {
    let onSelect: (Platform) -> Void
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("search.explore.title".localized)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(theme.effectiveTextColor)
                    Text("search.explore.subtitle".localized)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(theme.effectiveSecondaryTextColor)
                }
                Spacer()
                Image(systemName: "arrow.right")
                    .foregroundStyle(theme.effectiveSecondaryTextColor)
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    ForEach(Platform.allCases, id: \.rawValue) { platform in
                        Button { onSelect(platform) } label: {
                            VStack(spacing: 6) {
                                PlatformBadge(platform: platform, size: 42)
                                    .frame(width: 58, height: 58)
                                    .background(theme.effectiveCardColor.opacity(0.92), in: RoundedRectangle(cornerRadius: 18))
                                Text(platform.rawValue)
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundStyle(theme.effectiveTextColor)
                                    .lineLimit(1)
                            }
                            .frame(width: 104, height: 94)
                            .adaptiveGlass(
                                in: RoundedRectangle(cornerRadius: 20, style: .continuous),
                                interactive: true
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("search.platform.\(platform.rawValue)")
                    }
                }
                .padding(.horizontal, 16)
            }
            .frame(height: 98)
        }
    }
}

private struct SearchEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 42, weight: .medium))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.system(size: 20, weight: .bold))
            Text(subtitle)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
    }
}

private struct SearchProfileRow: View {
    let profile: UserProfile
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            AvatarView(url: profile.avatarUrl, size: 58, showBorder: true)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text(profile.username)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(theme.effectiveTextColor)
                        .lineLimit(1)
                    if profile.rating >= 4.5 {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(theme.effectivePrimary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(theme.effectiveSecondaryTextColor)
                }

                if !profile.platforms.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(profile.platforms.compactMap(Platform.init(rawValue:)), id: \.rawValue) {
                                PlatformBadge(platform: $0, size: 20)
                            }
                        }
                    }
                    .scrollDisabled(true)
                }

                let games = Array((profile.games + profile.wantedGames).uniqued().prefix(5))
                if !games.isEmpty {
                    Text(games.joined(separator: "  ·  "))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(theme.effectiveSecondaryTextColor)
                        .lineLimit(2)
                }

                if !profile.skills.isEmpty || !profile.subscriptions.isEmpty {
                    HStack(spacing: 10) {
                        if !profile.skills.isEmpty {
                            Label("\(profile.skills.count)", systemImage: "bolt.fill")
                        }
                        if !profile.subscriptions.isEmpty {
                            Label("\(profile.subscriptions.count)", systemImage: "rectangle.stack.badge.person.crop")
                        }
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(theme.effectivePrimary)
                }
            }
        }
        .padding(14)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
