import Foundation

// MARK: - User Context

struct UserContext {
    let userGames: [String]
    let wantedGames: [String]
    let userSkills: [String]
    let userSubscriptions: [String]
}

// MARK: - OpenAI Response Models

private struct OpenAIRequest: Codable {
    struct Message: Codable {
        let role: String
        let content: String
    }
    let model: String
    let messages: [Message]
    let maxTokens: Int
    let temperature: Double

    enum CodingKeys: String, CodingKey {
        case model, messages, temperature
        case maxTokens = "max_tokens"
    }
}

private struct OpenAIResponse: Codable {
    struct Choice: Codable {
        struct Message: Codable {
            let content: String
        }
        let message: Message
    }
    let choices: [Choice]
}

// MARK: - Service

final class ChatGPTService {
    private let apiURL = URL(string: "https://api.openai.com/v1/chat/completions")!

    private var apiKey: String {
        Bundle.main.infoDictionary?["OPENAI_API_KEY"] as? String ?? ""
    }

    func sendMessage(_ message: String, userContext: UserContext) async throws -> String {
        let systemPrompt = buildSystemPrompt(userContext: userContext)

        let requestBody = OpenAIRequest(
            model: AppConstants.AI.model,
            messages: [
                .init(role: "system", content: systemPrompt),
                .init(role: "user", content: message)
            ],
            maxTokens: AppConstants.AI.maxTokens,
            temperature: 0.7
        )

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw ChatGPTError.apiError
        }

        let decoded = try JSONDecoder().decode(OpenAIResponse.self, from: data)
        return decoded.choices.first?.message.content ?? ""
    }

    private func buildSystemPrompt(userContext: UserContext) -> String {
        var parts = [
            "You are a helpful gaming assistant for UniShare — a social app for exchanging gaming accounts and skills.",
            "Keep responses concise (under 200 tokens).",
            "Always recommend specific game titles when relevant."
        ]

        if !userContext.userGames.isEmpty {
            parts.append("The user plays: \(userContext.userGames.joined(separator: ", "))")
        }
        if !userContext.wantedGames.isEmpty {
            parts.append("They want to play: \(userContext.wantedGames.joined(separator: ", "))")
        }
        if !userContext.userSkills.isEmpty {
            parts.append("Their gaming skills: \(userContext.userSkills.joined(separator: ", "))")
        }
        if !userContext.userSubscriptions.isEmpty {
            parts.append("Their subscriptions: \(userContext.userSubscriptions.joined(separator: ", "))")
        }

        return parts.joined(separator: "\n")
    }

    // MARK: - Game name extraction

    func extractGameNames(from text: String) -> [String] {
        // Simple extraction: look for quoted titles or capitalized multi-word phrases
        var names: [String] = []

        // Match "Game Name" or 'Game Name'
        let quotedPattern = try? NSRegularExpression(pattern: "[\"']([^\"']+)[\"']")
        let range = NSRange(text.startIndex..., in: text)
        quotedPattern?.enumerateMatches(in: text, range: range) { match, _, _ in
            if let range = match.flatMap({ Range($0.range(at: 1), in: text) }) {
                names.append(String(text[range]))
            }
        }

        return names
    }

    enum ChatGPTError: LocalizedError {
        case apiError
        case emptyResponse

        var errorDescription: String? {
            switch self {
            case .apiError: return "AI service unavailable"
            case .emptyResponse: return "Empty response from AI"
            }
        }
    }
}
