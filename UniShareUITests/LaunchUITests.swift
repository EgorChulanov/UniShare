import XCTest

@MainActor
final class LaunchUITests: XCTestCase {
    func testLaunchShowsWorkingAuthenticationForm() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.secureTextFields["auth.password"].exists)
        XCTAssertTrue(app.buttons["auth.submit"].exists)
        XCTAssertTrue(app.buttons["auth.switchMode"].exists)
    }

    func testFullRegistrationProfileAndDeletionAgainstLocalSupabase() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let url = environment["UNISHARE_E2E_URL"],
              let key = environment["UNISHARE_E2E_KEY"] else {
            throw XCTSkip("Local Supabase credentials were not provided")
        }

        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_SUPABASE_URL": url,
            "UNISHARE_SUPABASE_KEY": key,
            "UNISHARE_UI_TESTING": "1"
        ]
        app.launch()

        let suffix = String(Int(Date().timeIntervalSince1970))
        let email = "ui.\(suffix)@unishare.test"
        let password = "UniShare-UI-\(suffix)!"

        XCTAssertTrue(app.buttons["auth.switchMode"].waitForExistence(timeout: 8))
        app.buttons["auth.switchMode"].tap()
        let emailField = app.textFields["auth.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 3))
        emailField.tap()
        emailField.typeText(email)
        app.secureTextFields["auth.password"].tap()
        app.secureTextFields["auth.password"].typeText(password)
        app.secureTextFields["auth.confirmation"].tap()
        app.secureTextFields["auth.confirmation"].typeText(password)
        app.swipeUp()
        app.buttons["auth.acceptTerms"].tap()
        app.buttons["auth.submit"].tap()

        let username = "UITest\(suffix.suffix(6))"
        let usernameField = app.textFields["onboarding.username"]
        XCTAssertTrue(usernameField.waitForExistence(timeout: 12))
        usernameField.tap()
        usernameField.typeText(username)
        advanceOnboarding(app, to: "avatar")
        advanceOnboarding(app, to: "platform")

        let steam = app.buttons["onboarding.platform.Steam"]
        XCTAssertTrue(steam.waitForExistence(timeout: 4))
        steam.tap()
        advanceOnboarding(app, to: "games")

        let search = app.textFields["onboarding.gameSearch"]
        XCTAssertTrue(search.waitForExistence(timeout: 4))
        search.tap()
        search.typeText("Fortnite")
        let fortnite = app.buttons["onboarding.gameResult.Fortnite"]
        XCTAssertTrue(fortnite.waitForExistence(timeout: 15))
        fortnite.tap()
        app.keyboards.buttons["Return"].tapIfExists()
        advanceOnboarding(app, to: "skills")
        advanceOnboarding(app, to: "subscriptions")
        app.buttons["onboarding.next"].tap()

        let profileTab = app.buttons["tab.profile"]
        if !profileTab.waitForExistence(timeout: 15) {
            let saveError = app.staticTexts["onboarding.error"]
            XCTFail(saveError.exists ? "Profile save failed: \(saveError.label)" : "Profile tab did not appear after onboarding")
            return
        }
        profileTab.tap()
        XCTAssertTrue(app.staticTexts["profile.username"].waitForExistence(timeout: 8))
        XCTAssertEqual(app.staticTexts["profile.username"].label, "@\(username)")

        let settings = app.buttons["profile.settings"]
        if !settings.exists { app.swipeUp() }
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        let delete = app.buttons["settings.deleteAccount"]
        if !delete.exists { app.swipeUp() }
        XCTAssertTrue(delete.waitForExistence(timeout: 5))
        delete.tap()
        XCTAssertTrue(app.buttons["settings.confirmDelete"].waitForExistence(timeout: 5))
        app.buttons["settings.confirmDelete"].tap()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 15))
    }

    func testMutualMatchAndChatAgainstLocalSupabase() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let url = environment["UNISHARE_E2E_URL"],
              let key = environment["UNISHARE_E2E_KEY"] else {
            throw XCTSkip("Local Supabase credentials were not provided")
        }

        let api = E2EAPI(baseURL: try XCTUnwrap(URL(string: url)), publishableKey: key)
        let suffix = String(Int(Date().timeIntervalSince1970))
        let password = "UniShare-UI-\(suffix)!"
        let alice = try await api.signUp(email: "ui.alice.\(suffix)@unishare.test", password: password)
        let bob = try await api.signUp(email: "ui.bob.\(suffix)@unishare.test", password: password)
        try await api.createProfile(session: alice, username: "Alice\(suffix.suffix(5))", platform: "Steam", game: "Fortnite")
        try await api.createProfile(session: bob, username: "Bob\(suffix.suffix(5))", platform: "PlayStation", game: "Fortnite")
        try await api.sendLike(from: bob, to: alice.userID)
        addTeardownBlock {
            try? await api.deleteAccount(session: alice)
            try? await api.deleteAccount(session: bob)
        }

        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_SUPABASE_URL": url,
            "UNISHARE_SUPABASE_KEY": key,
            "UNISHARE_UI_TESTING": "1"
        ]
        app.launch()

        let emailField = app.textFields["auth.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 8))
        emailField.tap()
        emailField.typeText(alice.email)
        app.secureTextFields["auth.password"].tap()
        app.secureTextFields["auth.password"].typeText(password)
        app.buttons["auth.submit"].tap()

        XCTAssertTrue(app.otherElements["feed.card.\(bob.userID)"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["feed.like"].isHittable)
        app.buttons["feed.like"].tap()

        let chatID = try await api.waitForChat(between: alice, and: bob.userID)
        app.buttons["tab.chats"].tap()
        let chatRow = app.buttons["chats.row.\(chatID)"]
        XCTAssertTrue(chatRow.waitForExistence(timeout: 12))
        chatRow.tap()

        let input = app.textFields["chat.input"]
        XCTAssertTrue(input.waitForExistence(timeout: 8))
        let message = "UI E2E \(suffix.suffix(6))"
        input.tap()
        input.typeText(message)
        XCTAssertTrue(app.buttons["chat.send"].isHittable)
        app.buttons["chat.send"].tap()
        XCTAssertTrue(app.staticTexts[message].waitForExistence(timeout: 10))
    }

    private func advanceOnboarding(_ app: XCUIApplication, to step: String) {
        let button = app.buttons["onboarding.next"]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Onboarding next button is missing")
        XCTAssertTrue(button.isHittable, "Onboarding next button is not hittable")
        button.tap()
        XCTAssertTrue(
            app.otherElements["onboarding.step.\(step)"].waitForExistence(timeout: 5),
            "Onboarding did not advance to \(step)"
        )
    }
}

private struct E2EAPI: Sendable {
    struct Session: Sendable {
        let email: String
        let userID: String
        let accessToken: String
    }

    let baseURL: URL
    let publishableKey: String

    func signUp(email: String, password: String) async throws -> Session {
        let data = try await request(
            path: "/auth/v1/signup",
            method: "POST",
            body: ["email": email, "password": password]
        )
        let json = try object(from: data)
        guard let token = json["access_token"] as? String,
              let user = json["user"] as? [String: Any],
              let userID = user["id"] as? String else {
            throw apiError("Signup did not return an authenticated session", data: data)
        }
        return Session(email: email, userID: userID, accessToken: token)
    }

    func createProfile(session: Session, username: String, platform: String, game: String) async throws {
        _ = try await request(
            path: "/rest/v1/users",
            method: "POST",
            token: session.accessToken,
            body: [
                "uid": session.userID,
                "username": username,
                "platforms": [platform],
                "games": [game],
                "skills": ["Team play"],
                "platform_games": [platform: [game]],
                "has_skills_profile": true,
                "onboarding_complete": true
            ]
        )
    }

    func sendLike(from session: Session, to userID: String) async throws {
        _ = try await request(
            path: "/rest/v1/rpc/send_like",
            method: "POST",
            token: session.accessToken,
            body: ["target_uid": userID, "kind": "exchange", "request_id": UUID().uuidString]
        )
    }

    func waitForChat(between session: Session, and partnerID: String) async throws -> String {
        for _ in 0..<24 {
            let data = try await request(
                path: "/rest/v1/chats?select=id,participants",
                method: "GET",
                token: session.accessToken
            )
            let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
            if let row = rows.first(where: {
                let participants = $0["participants"] as? [String] ?? []
                return participants.contains(session.userID) && participants.contains(partnerID)
            }), let chatID = row["id"] as? String {
                return chatID
            }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw apiError("Mutual like did not create a chat", data: Data())
    }

    func deleteAccount(session: Session) async throws {
        _ = try await request(
            path: "/functions/v1/delete-account",
            method: "POST",
            token: session.accessToken,
            body: ["confirmation": "DELETE"]
        )
    }

    private func request(
        path: String,
        method: String,
        token: String? = nil,
        body: [String: Any]? = nil
    ) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw apiError("Invalid E2E URL", data: Data())
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token ?? publishableKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = try XCTUnwrap((response as? HTTPURLResponse)?.statusCode)
        guard (200..<300).contains(status) else {
            throw apiError("HTTP \(status) for \(path)", data: data)
        }
        return data
    }

    private func object(from data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw apiError("Expected JSON object", data: data)
        }
        return value
    }

    private func apiError(_ message: String, data: Data) -> NSError {
        let response = String(data: data, encoding: .utf8) ?? ""
        return NSError(domain: "UniShareUITests.E2EAPI", code: 1, userInfo: [
            NSLocalizedDescriptionKey: response.isEmpty ? message : "\(message): \(response)"
        ])
    }
}

private extension XCUIElement {
    func tapIfExists() {
        if exists && isHittable { tap() }
    }
}
