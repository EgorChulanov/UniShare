import Foundation
import Supabase
import UIKit

// MARK: - Rawg Models

struct RawgGame: Codable, Identifiable {
    let id: Int
    let name: String
    let backgroundImage: String?
    let rating: Double?
    let released: String?
    let descriptionRaw: String?
    let metacritic: Int?
    let playtime: Int?
    let genres: [String]?
    let platforms: [String]?
    let website: String?

    enum CodingKeys: String, CodingKey {
        case id, name, rating, released
        case backgroundImage = "background_image"
        case descriptionRaw = "description_raw"
        case metacritic, playtime, genres, platforms, website
    }

    init(
        id: Int,
        name: String,
        backgroundImage: String? = nil,
        rating: Double? = nil,
        released: String? = nil,
        descriptionRaw: String? = nil,
        metacritic: Int? = nil,
        playtime: Int? = nil,
        genres: [String]? = nil,
        platforms: [String]? = nil,
        website: String? = nil
    ) {
        self.id = id
        self.name = name
        self.backgroundImage = backgroundImage
        self.rating = rating
        self.released = released
        self.descriptionRaw = descriptionRaw
        self.metacritic = metacritic
        self.playtime = playtime
        self.genres = genres
        self.platforms = platforms
        self.website = website
    }
}

struct RawgSearchResponse: Codable {
    let results: [RawgGame]
}

// MARK: - Service

final class RawgService {
    private let client = SupabaseManager.shared.client
    private var searchCache: [String: [RawgGame]] = [:]
    private let cacheLock = NSLock()

    var isConfigured: Bool {
        SupabaseManager.shared.isConfigured
    }

    func searchGames(_ query: String) async -> [RawgGame] {
        guard let sanitized = GameNameValidator.sanitized(query) else { return [] }
        let key = GameNameValidator.normalized(sanitized)

        // Return cached result if available
        if let cached = cachedResults(for: key) {
            return cached
        }

        let localResults = GameCatalog.search(sanitized)
        guard isConfigured else {
            let results = addingCustomResult(to: localResults, query: sanitized)
            store(results, for: key)
            return results
        }

        do {
            let response: RawgSearchResponse = try await client.functions.invoke(
                "game-search",
                options: FunctionInvokeOptions(body: ["query": sanitized])
            )
            let results = addingCustomResult(to: merge(response.results, with: localResults), query: sanitized)
            store(results, for: key)
            return results
        } catch {
            return addingCustomResult(to: localResults, query: sanitized)
        }
    }

    func popularGames() async -> [RawgGame] {
        // Version the key when the remote payload shape changes so stale cover-less rows are not reused.
        let key = "__popular_v2__"
        if let cached = cachedResults(for: key) { return cached }
        guard isConfigured else { return [] }
        do {
            let response: RawgSearchResponse = try await client.functions.invoke(
                "game-search",
                options: FunctionInvokeOptions(body: ["popular": true])
            )
            store(response.results, for: key)
            return response.results
        } catch {
            return []
        }
    }

    func searchGameTags(_ query: String) async -> [GameTag] {
        await searchGames(query).map(gameToTag)
    }

    func getGame(id: Int) async -> RawgGame? {
        do {
            let game: RawgGame = try await client.functions.invoke(
                "game-search",
                options: FunctionInvokeOptions(body: ["gameId": id])
            )
            return game
        } catch {
            print("Rawg getGame error: \(error)")
            return nil
        }
    }

    func fetchCoverImage(for game: RawgGame) async -> UIImage? {
        guard let urlString = game.backgroundImage, let url = URL(string: urlString) else { return nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return UIImage(data: data)
        } catch {
            return nil
        }
    }

    func gameToTag(_ game: RawgGame) -> GameTag {
        GameTag(name: game.name, coverUrl: game.backgroundImage, rawgId: game.id > 0 ? game.id : nil)
    }

    private func merge(_ remote: [RawgGame], with local: [RawgGame]) -> [RawgGame] {
        var seen = Set<String>()
        return (remote + local).filter { game in
            seen.insert(GameNameValidator.normalized(game.name)).inserted
        }
    }

    private func addingCustomResult(to games: [RawgGame], query: String) -> [RawgGame] {
        guard let customName = GameNameValidator.sanitized(query) else { return games }
        let normalized = GameNameValidator.normalized(customName)
        guard !games.contains(where: { GameNameValidator.normalized($0.name) == normalized }) else {
            return games
        }
        return games + [RawgGame(id: Int.min, name: customName, backgroundImage: nil, rating: nil, released: nil)]
    }

    private func cachedResults(for key: String) -> [RawgGame]? {
        cacheLock.withLock {
            if let value = searchCache[key] { return value }
            guard let data = UserDefaults.standard.data(forKey: "rawg.cache.\(key)"),
                  let entry = try? JSONDecoder().decode(RawgCacheEntry.self, from: data),
                  entry.expiresAt > Date() else { return nil }
            searchCache[key] = entry.games
            return entry.games
        }
    }

    private func store(_ games: [RawgGame], for key: String) {
        cacheLock.withLock {
            searchCache[key] = games
            let entry = RawgCacheEntry(games: games, expiresAt: Date().addingTimeInterval(7 * 86_400))
            if let data = try? JSONEncoder().encode(entry) {
                UserDefaults.standard.set(data, forKey: "rawg.cache.\(key)")
            }
        }
    }
}

private struct RawgCacheEntry: Codable {
    let games: [RawgGame]
    let expiresAt: Date
}
