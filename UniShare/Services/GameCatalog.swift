import Foundation

enum GameNameValidator {
    static let maximumLength = 80

    static func sanitized(_ value: String) -> String? {
        let collapsed = value
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        guard collapsed.count >= 2,
              collapsed.count <= maximumLength,
              collapsed.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else {
            return nil
        }
        return collapsed
    }

    static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func uniqueNames(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.compactMap { value in
            guard let sanitized = sanitized(value) else { return nil }
            return seen.insert(normalized(sanitized)).inserted ? sanitized : nil
        }
    }
}

enum GameCatalog {
    private static let titles = [
        "Fortnite", "Minecraft", "Roblox", "Grand Theft Auto V", "Counter-Strike 2",
        "Valorant", "Dota 2", "League of Legends", "Overwatch 2", "Apex Legends",
        "Call of Duty: Warzone", "Call of Duty: Black Ops 6", "PUBG: Battlegrounds",
        "Rocket League", "Tom Clancy's Rainbow Six Siege", "Destiny 2", "Warframe",
        "Genshin Impact", "Honkai: Star Rail", "Zenless Zone Zero", "Marvel Rivals",
        "EA Sports FC 26", "Forza Horizon 5", "Gran Turismo 7", "The Crew Motorfest",
        "Red Dead Redemption 2", "Cyberpunk 2077", "The Witcher 3: Wild Hunt",
        "Elden Ring", "Dark Souls III", "Bloodborne", "Sekiro: Shadows Die Twice",
        "Baldur's Gate 3", "Hades", "Hades II", "Hogwarts Legacy", "Helldivers 2",
        "Death Stranding 2", "Clair Obscur: Expedition 33", "Monster Hunter Wilds",
        "The Last of Us Part II", "God of War Ragnarok", "Ghost of Tsushima",
        "Horizon Forbidden West", "Marvel's Spider-Man 2", "Astro Bot",
        "The Legend of Zelda: Tears of the Kingdom", "The Legend of Zelda: Breath of the Wild",
        "Super Mario Odyssey", "Mario Kart 8 Deluxe", "Super Smash Bros. Ultimate",
        "Animal Crossing: New Horizons", "Pokemon Scarlet", "Pokemon Violet",
        "Splatoon 3", "Metroid Prime 4", "Palworld", "Fall Guys", "Among Us",
        "Terraria", "Stardew Valley", "No Man's Sky", "Sea of Thieves",
        "Dead by Daylight", "Phasmophobia", "Rust", "ARK: Survival Ascended",
        "World of Warcraft", "Final Fantasy XIV", "The Elder Scrolls Online",
        "Diablo IV", "Path of Exile 2", "Fallout 76", "The Sims 4"
    ]

    static func search(_ query: String, limit: Int = 12) -> [RawgGame] {
        guard let sanitized = GameNameValidator.sanitized(query) else { return [] }
        let needle = GameNameValidator.normalized(sanitized)

        return titles.enumerated()
            .compactMap { index, title -> (Int, RawgGame)? in
                let normalized = GameNameValidator.normalized(title)
                guard normalized.contains(needle) else { return nil }
                let rank = normalized.hasPrefix(needle) ? 0 : 1
                return (rank, RawgGame(id: -(index + 1), name: title, backgroundImage: nil, rating: nil, released: nil))
            }
            .sorted { lhs, rhs in
                lhs.0 == rhs.0 ? lhs.1.name < rhs.1.name : lhs.0 < rhs.0
            }
            .prefix(limit)
            .map(\.1)
    }
}
