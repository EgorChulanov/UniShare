import Foundation
import Supabase
import UIKit

// MARK: - Rawg Models

struct RawgGame: Codable {
    let id: Int
    let name: String
    let backgroundImage: String?
    let rating: Double?
    let released: String?

    enum CodingKeys: String, CodingKey {
        case id, name, rating, released
        case backgroundImage = "background_image"
    }
}

struct RawgSearchResponse: Codable {
    let results: [RawgGame]
}

// MARK: - Service

final class RawgService {
    private let client = SupabaseManager.shared.client
    private var searchCache: [String: [RawgGame]] = [:]

    var isConfigured: Bool {
        SupabaseManager.shared.isConfigured
    }

    func searchGames(_ query: String) async -> [RawgGame] {
        guard let sanitized = GameNameValidator.sanitized(query) else { return [] }
        let key = GameNameValidator.normalized(sanitized)

        // Return cached result if available
        if let cached = searchCache[key] {
            return cached
        }

        let localResults = GameCatalog.search(sanitized)
        guard isConfigured else {
            let results = addingCustomResult(to: localResults, query: sanitized)
            searchCache[key] = results
            return results
        }

        do {
            let response: RawgSearchResponse = try await client.functions.invoke(
                "game-search",
                options: FunctionInvokeOptions(body: ["query": sanitized])
            )
            let results = addingCustomResult(to: merge(response.results, with: localResults), query: sanitized)
            searchCache[key] = results
            return results
        } catch {
            return addingCustomResult(to: localResults, query: sanitized)
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
}
