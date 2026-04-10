import Foundation
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
    private let baseURL = "https://api.rawg.io/api"
    private var apiKey: String {
        Bundle.main.infoDictionary?["RAWG_API_KEY"] as? String ?? ""
    }

    // In-memory cache to reduce API quota usage
    private var searchCache: [String: [RawgGame]] = [:]

    func searchGames(_ query: String) async -> [RawgGame] {
        let key = query.lowercased().trimmingCharacters(in: .whitespaces)
        guard !key.isEmpty else { return [] }

        // Return cached result if available
        if let cached = searchCache[key] {
            return cached
        }

        guard let encoded = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            return []
        }
        let urlString = "\(baseURL)/games?key=\(apiKey)&search=\(encoded)&page_size=10"
        guard let url = URL(string: urlString) else { return [] }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(RawgSearchResponse.self, from: data)
            searchCache[key] = response.results
            return response.results
        } catch {
            print("Rawg search error: \(error)")
            return []
        }
    }

    func getGame(id: Int) async -> RawgGame? {
        let urlString = "\(baseURL)/games/\(id)?key=\(apiKey)"
        guard let url = URL(string: urlString) else { return nil }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return try JSONDecoder().decode(RawgGame.self, from: data)
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
        GameTag(name: game.name, coverUrl: game.backgroundImage, rawgId: game.id)
    }
}
