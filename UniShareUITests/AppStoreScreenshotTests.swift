import XCTest

@MainActor
final class AppStoreScreenshotTests: XCTestCase {
    func testCaptureAppStoreScreenshots() throws {
        let environment = ProcessInfo.processInfo.environment
        let url = try XCTUnwrap(environment["UNISHARE_SCREENSHOT_URL"])
        let key = try XCTUnwrap(environment["UNISHARE_SCREENSHOT_KEY"])
        let email = try XCTUnwrap(environment["UNISHARE_SCREENSHOT_EMAIL"])
        let password = try XCTUnwrap(environment["UNISHARE_SCREENSHOT_PASSWORD"])
        let device = environment["UNISHARE_SCREENSHOT_DEVICE"] ?? "device"

        let app = XCUIApplication()
        app.launchEnvironment = [
            "UNISHARE_SUPABASE_URL": url,
            "UNISHARE_SUPABASE_KEY": key,
            "UNISHARE_UI_TESTING": "1",
            "AppleLanguages": "(en)",
            "AppleLocale": "en_US"
        ]
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        let emailField = app.textFields["auth.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 12))
        emailField.tap()
        emailField.typeText(email)
        app.secureTextFields["auth.password"].tap()
        app.secureTextFields["auth.password"].typeText(password)
        app.buttons["auth.submit"].tap()

        XCTAssertTrue(app.buttons["feed.like"].waitForExistence(timeout: 20))
        let loadedCard = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH 'feed.card.' AND identifier != 'feed.card.info'")
        ).firstMatch
        XCTAssertTrue(loadedCard.waitForExistence(timeout: 20))
        capture("01-home", device: device)

        app.buttons["tab.chats"].tap()
        let chatRow = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'chats.row.'")
        ).firstMatch
        XCTAssertTrue(chatRow.waitForExistence(timeout: 15))
        capture("03-chats", device: device)
        chatRow.tap()
        XCTAssertTrue(app.textFields["chat.input"].waitForExistence(timeout: 12))
        capture("04-conversation", device: device)

        if !app.buttons["tab.profile"].isHittable {
            let backButton = app.navigationBars.buttons.firstMatch
            XCTAssertTrue(backButton.waitForExistence(timeout: 5))
            backButton.tap()
        }
        app.buttons["tab.profile"].tap()
        XCTAssertTrue(app.staticTexts["profile.username"].waitForExistence(timeout: 15))
        capture("05-profile", device: device)
    }

    private func capture(_ name: String, device: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "\(device)-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
