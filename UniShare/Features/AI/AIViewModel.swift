import Foundation
import SwiftUI

struct AIMessage: Identifiable {
    var id = UUID()
    var text: String
    var isFromUser: Bool
    var gameCards: [AIGameCard] = []
    var timestamp = Date()
}

struct AIGameCard: Identifiable {
    var id = UUID()
    var name: String
    var coverUrl: String?
    var rating: Double?
}

@MainActor
final class AIViewModel: ObservableObject {
    @Published var messages: [AIMessage] = []
    @Published var inputText = ""
    @Published var isThinking = false
    @Published var errorMessage: String?
    @Published var aiTapCount = 0

    let quickCommands: [(key: String, icon: String)] = [
        ("ai.command.recommend", "gamecontroller.fill"),
        ("ai.command.exchange", "arrow.left.arrow.right"),
        ("ai.command.skill", "star.fill"),
        ("ai.command.trending", "chart.line.uptrend.xyaxis")
    ]

    private let chatGPT: ChatGPTService
    private let rawg: RawgService
    private let db: SupabaseService
    private let auth: SupabaseAuthService

    init(chatGPT: ChatGPTService, rawg: RawgService, db: SupabaseService, auth: SupabaseAuthService) {
        self.chatGPT = chatGPT
        self.rawg = rawg
        self.db = db
        self.auth = auth
    }

    var inputIsValid: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        inputText.count <= AppConstants.AI.maxMessageLength
    }

    func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isThinking else { return }
        inputText = ""

        let userMsg = AIMessage(text: text, isFromUser: true)
        messages.append(userMsg)
        isThinking = true
        HapticsManager.shared.impact(.light)

        do {
            let context = await buildUserContext()
            let response = try await chatGPT.sendMessage(text, userContext: context)
            let gameCards = await extractGameCards(from: response)

            let aiMsg = AIMessage(text: response, isFromUser: false, gameCards: gameCards)
            messages.append(aiMsg)

            // Save to Firestore
            if let uid = auth.uid {
                try? await db.saveAIRequest(userId: uid, message: text, response: response)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isThinking = false
    }

    func sendQuickCommand(_ key: String) {
        inputText = key.localized
        Task { await sendMessage() }
    }

    private func buildUserContext() async -> UserContext {
        guard let uid = auth.uid,
              let profile = try? await db.getUser(uid: uid) else {
            return UserContext(userGames: [], wantedGames: [], userSkills: [], userSubscriptions: [])
        }
        return UserContext(
            userGames: profile.games,
            wantedGames: profile.wantedGames,
            userSkills: profile.skills,
            userSubscriptions: profile.subscriptions.map { $0.name }
        )
    }

    private func extractGameCards(from response: String) async -> [AIGameCard] {
        let names = chatGPT.extractGameNames(from: response)
        return await withTaskGroup(of: AIGameCard?.self) { group in
            for name in names.prefix(3) {
                group.addTask {
                    let games = await self.rawg.searchGames(name)
                    if let game = games.first {
                        return AIGameCard(name: game.name, coverUrl: game.backgroundImage, rating: game.rating)
                    }
                    return AIGameCard(name: name)
                }
            }
            var cards: [AIGameCard] = []
            for await card in group {
                if let card { cards.append(card) }
            }
            return cards
        }
    }
}
