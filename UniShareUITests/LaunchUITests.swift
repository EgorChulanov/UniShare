import XCTest

@MainActor
final class LaunchUITests: XCTestCase {
    func testSearchCatalogKeepsSearchFieldVisible() {
        let app = XCUIApplication()
        app.launchEnvironment = ["UNISHARE_UI_CATALOG": "search"]
        app.launch()

        let searchField = app.textFields["search.field"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 8))
        XCTAssertTrue(searchField.isHittable)
        assertContained(searchField.frame, in: app.windows.firstMatch.frame)
        XCTAssertTrue(app.staticTexts["Popular now"].exists)
    }

    func testAirShareCatalogFitsOnIPhone() {
        let app = XCUIApplication()
        app.launchEnvironment = ["UNISHARE_UI_CATALOG": "airshare"]
        app.launch()

        let start = app.buttons["airshare.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 8))
        assertContained(start.frame, in: app.windows.firstMatch.frame)
        XCTAssertTrue(app.staticTexts["AirShare"].exists)
    }

    func testAirShareProfileUsesFeedCardAndAcceptsWithSwipe() {
        let app = XCUIApplication()
        app.launchEnvironment = ["UNISHARE_UI_CATALOG": "airshare-card"]
        app.launchArguments = ["-AppleLanguages", "(en)"]
        app.launch()

        let card = app.otherElements["feed.card.airshare-catalog-card"]
        XCTAssertTrue(card.waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["PlayStation"].exists)
        XCTAssertTrue(app.staticTexts["Steam"].exists)
        XCTAssertTrue(app.staticTexts["Nintendo"].exists)
        XCTAssertTrue(app.staticTexts["Wanted Games"].exists)

        let start = card.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5))
        let end = card.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
        start.press(forDuration: 0.08, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0)

        XCTAssertTrue(app.staticTexts["accepted"].waitForExistence(timeout: 4))
    }

    func testNativeTabBarFeedIconDoesNotExpandLayout() {
        let app = XCUIApplication()
        app.launchEnvironment = ["UNISHARE_UI_CATALOG": "tabs"]
        app.launchArguments = ["-AppleLanguages", "(en)"]
        app.launch()

        let feed = app.buttons["Home"]
        XCTAssertTrue(feed.waitForExistence(timeout: 8))
        let window = app.windows.firstMatch.frame
        assertContained(feed.frame, in: window)
        XCTAssertLessThan(feed.frame.width, window.width * 0.5)
        XCTAssertTrue(app.buttons["Chats"].exists)
        XCTAssertTrue(app.buttons["Profile"].exists)
        XCTAssertTrue(app.buttons["Search"].exists)
    }

    func testStoryCatalogFitsAndAdvances() {
        let app = XCUIApplication()
        app.launchEnvironment = ["UNISHARE_UI_CATALOG": "stories"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Connect safely"].waitForExistence(timeout: 8))
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.84, dy: 0.48)).tap()
        XCTAssertTrue(app.staticTexts["Check every detail"].waitForExistence(timeout: 4))
    }

    func testCardCatalogRendersThreePlatformsAndSingleGameRow() {
        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_UI_CATALOG": "cards",
            "UNISHARE_UI_CARD_DESIGN": "classic"
        ]
        app.launch()

        XCTAssertTrue(app.otherElements["feed.card.ui-catalog-card"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["PlayStation"].exists)
        XCTAssertTrue(app.staticTexts["Steam"].exists)
        XCTAssertTrue(app.staticTexts["Nintendo"].exists)
        XCTAssertTrue(app.staticTexts["Wanted Games"].exists)

        app.otherElements["feed.card.ui-catalog-card"].tap()
        let close = app.buttons["profile.detail.close"]
        XCTAssertTrue(close.waitForExistence(timeout: 4))
        XCTAssertGreaterThanOrEqual(close.frame.minY, app.windows.firstMatch.frame.minY)
        XCTAssertLessThanOrEqual(close.frame.maxY, app.windows.firstMatch.frame.maxY)
    }

    func testSkillsCardUsesInteractiveCardPresentation() {
        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_UI_CATALOG": "cards",
            "UNISHARE_UI_CARD_DESIGN": "arcade",
            "UNISHARE_UI_CARD_FACE": "skills"
        ]
        app.launch()

        XCTAssertTrue(app.otherElements["feed.skillCard.ui-catalog-card"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Coaching"].exists)

        app.otherElements["feed.skillCard.ui-catalog-card"].tap()
        XCTAssertTrue(app.buttons["profile.detail.close"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["Coaching"].exists)
    }

    func testLaunchShowsWorkingAuthenticationForm() {
        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_UI_TESTING": "1",
            "UNISHARE_RESET_SESSION": "1"
        ]
        app.launch()

        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.secureTextFields["auth.password"].exists)
        XCTAssertTrue(app.buttons["auth.submit"].exists)
        XCTAssertTrue(app.buttons["auth.switchMode"].exists)
        let window = app.windows.firstMatch.frame
        assertContained(app.textFields["auth.email"].frame, in: window)
        assertContained(app.secureTextFields["auth.password"].frame, in: window)
        assertContained(app.buttons["auth.submit"].frame, in: window)
    }

    func testRegistrationFormFitsAndScrollsOnIPhone() {
        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_UI_TESTING": "1",
            "UNISHARE_RESET_SESSION": "1",
            "UNISHARE_FORCE_REGISTRATION": "1"
        ]
        app.launch()

        let confirmation = app.secureTextFields["auth.confirmation"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 8))
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThanOrEqual(confirmation.frame.minY, window.minY)
        XCTAssertLessThanOrEqual(confirmation.frame.maxY, window.maxY)

        let terms = app.buttons["auth.acceptTerms"]
        for _ in 0..<3 where !terms.isHittable { app.swipeUp() }
        XCTAssertTrue(terms.waitForExistence(timeout: 4))
        XCTAssertTrue(terms.isHittable)
    }

    func testFullRegistrationProfileAndDeletionAgainstLocalSupabase() throws {
        let (url, key) = try e2eConfiguration()

        let suffix = String(Int(Date().timeIntervalSince1970))
        let email = "ui.\(suffix)@unishare.test"
        let password = "UniShare-UI-\(suffix)!"
        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_SUPABASE_URL": url,
            "UNISHARE_SUPABASE_KEY": key,
            "UNISHARE_UI_TESTING": "1",
            "UNISHARE_RESET_SESSION": "1",
            "UNISHARE_E2E_REGISTRATION": "1",
            "UNISHARE_E2E_EMAIL": email,
            "UNISHARE_E2E_PASSWORD": password
        ]
        app.launch()

        let emailField = app.textFields["auth.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 8))
        XCTAssertEqual(emailField.value as? String, email)
        XCTAssertTrue(app.secureTextFields["auth.confirmation"].exists)
        app.swipeUp()
        app.buttons["auth.acceptTerms"].tap()
        XCTAssertTrue(app.buttons["auth.submit"].isEnabled, "Registration form is invalid after entering matching passwords")
        app.buttons["auth.submit"].tap()

        let username = "UITest\(suffix.suffix(6))"
        let usernameField = app.textFields["onboarding.username"]
        XCTAssertTrue(usernameField.waitForExistence(timeout: 12))
        usernameField.tap()
        usernameField.typeText(username)
        let enteredUsername = (usernameField.value as? String) ?? username
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
        XCTAssertEqual(app.staticTexts["profile.username"].label, enteredUsername)

        let settings = app.buttons["profile.settings"]
        if !settings.exists { app.swipeUp() }
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        let delete = app.buttons["settings.deleteAccount"]
        if !delete.exists { app.swipeUp() }
        XCTAssertTrue(delete.waitForExistence(timeout: 5))
        delete.tap()
        let confirmDelete = app.buttons["settings.confirmDelete"].firstMatch
        XCTAssertTrue(confirmDelete.waitForExistence(timeout: 5))
        confirmDelete.tap()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 15))
    }

    func testMutualMatchAndChatAgainstLocalSupabase() async throws {
        let (url, key) = try e2eConfiguration()

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
            "UNISHARE_UI_TESTING": "1",
            "UNISHARE_RESET_SESSION": "1"
        ]
        app.launch()

        let emailField = app.textFields["auth.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 8))
        emailField.tap()
        emailField.typeText(alice.email)
        app.secureTextFields["auth.password"].tap()
        app.secureTextFields["auth.password"].typeText(password)
        app.buttons["auth.submit"].tap()
        dismissSavePasswordPrompt(in: app)

        let bobCard = app.otherElements["feed.card.\(bob.userID)"]
        XCTAssertTrue(bobCard.waitForExistence(timeout: 15))
        for _ in 0..<3 where bobCard.exists {
            let start = bobCard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.5))
            let end = bobCard.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
            start.press(forDuration: 0.08, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0)
            if bobCard.waitForNonExistence(timeout: 2) { break }
        }
        XCTAssertFalse(bobCard.exists, "Bob's card was not removed after a right swipe")

        let chatID = try await api.waitForChat(between: alice, and: bob.userID)
        dismissSavePasswordPrompt(in: app, timeout: 8)
        let chatsTab = app.buttons["tab.chats"]
        guard chatsTab.waitForExistence(timeout: 5) else {
            XCTFail("Chats tab is unavailable after dismissing the password prompt")
            return
        }
        chatsTab.tap()
        let chatRow = app.buttons["chats.row.\(chatID)"]
        guard chatRow.waitForExistence(timeout: 12) else {
            XCTFail("Matched chat did not appear in the chats list")
            return
        }
        chatRow.tap()

        let input = app.textFields["chat.input"]
        guard input.waitForExistence(timeout: 8) else {
            XCTFail("Chat composer did not appear")
            return
        }
        let message = "UI E2E \(suffix.suffix(6))"
        input.tap()
        input.typeText(message)
        let send = app.buttons["chat.send"]
        guard send.waitForExistence(timeout: 5), send.isEnabled else {
            XCTFail("Chat send button is unavailable after entering a message")
            return
        }
        send.tap()
        XCTAssertTrue(app.staticTexts[message].waitForExistence(timeout: 10))
        try await api.waitForMessage(message, in: chatID, session: alice)
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

    private func assertContained(_ frame: CGRect, in window: CGRect, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertGreaterThanOrEqual(frame.minX, window.minX, file: file, line: line)
        XCTAssertLessThanOrEqual(frame.maxX, window.maxX, file: file, line: line)
        XCTAssertGreaterThanOrEqual(frame.minY, window.minY, file: file, line: line)
        XCTAssertLessThanOrEqual(frame.maxY, window.maxY, file: file, line: line)
    }

    private func dismissSavePasswordPrompt(in app: XCUIApplication, timeout: TimeInterval = 4) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            for application in [app, springboard] {
                for label in ["Not Now", "Не сейчас"] {
                    let button = application.buttons[label].firstMatch
                    if button.exists && button.isHittable {
                        button.tap()
                        return
                    }
                }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
    }

    private func e2eConfiguration() throws -> (url: String, key: String) {
        let environment = ProcessInfo.processInfo.environment
        let url = environment["UNISHARE_E2E_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let key = environment["UNISHARE_E2E_KEY"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !url.isEmpty, !key.isEmpty,
              let components = URLComponents(string: url),
              components.url?.host != nil else {
            throw XCTSkip("Valid local Supabase credentials were not provided; run make test-ui-e2e")
        }
        return (url, key)
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

    func waitForMessage(_ text: String, in chatID: String, session: Session) async throws {
        let encodedText = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
        for _ in 0..<24 {
            let data = try await request(
                path: "/rest/v1/messages?select=id&chat_id=eq.\(chatID)&text=eq.\(encodedText)",
                method: "GET",
                token: session.accessToken
            )
            let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
            if !rows.isEmpty { return }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw apiError("Message was not persisted", data: Data())
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
