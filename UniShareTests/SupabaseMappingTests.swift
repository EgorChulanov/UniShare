import XCTest
import UIKit
@testable import UniShare

final class SupabaseMappingTests: XCTestCase {
    func testBrandAssetsAreCompiled() {
        let names = [
            "Brand-steam", "Brand-epicgames", "Brand-playstation", "Brand-nintendo",
            "Brand-discord", "Brand-youtube", "Brand-twitch", "Brand-ea",
            "Brand-ubisoft", "Brand-nvidia", "Brand-xbox"
        ]

        for name in names {
            XCTAssertNotNil(UIImage(named: name), "Missing compiled asset: \(name)")
        }

        for platform in Platform.allCases where platform.brandAssetName == nil {
            XCTAssertNotNil(UIImage(systemName: platform.icon), "Missing platform symbol: \(platform.icon)")
        }
    }

    func testSubscriptionDecodesCurrentSnakeCaseFormat() throws {
        let data = Data(#"{"name":"Steam","icon_name":"gamecontroller","url":"https://example.com"}"#.utf8)

        let row = try JSONDecoder().decode(SupabaseSubscriptionRow.self, from: data)

        XCTAssertEqual(row.name, "Steam")
        XCTAssertEqual(row.iconName, "gamecontroller")
        XCTAssertEqual(row.url, "https://example.com")
    }

    func testSubscriptionDecodesLegacyCamelCaseFormat() throws {
        let data = Data(#"{"name":"Discord","iconName":"bubble.left.fill"}"#.utf8)

        let row = try JSONDecoder().decode(SupabaseSubscriptionRow.self, from: data)

        XCTAssertEqual(row.name, "Discord")
        XCTAssertEqual(row.iconName, "bubble.left.fill")
        XCTAssertNil(row.url)
    }

    func testSubscriptionEncodesCanonicalSnakeCaseFormat() throws {
        let row = SupabaseSubscriptionRow(name: "Twitch", iconName: "video.fill", url: nil)

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(row)) as? [String: Any]
        )

        XCTAssertEqual(object["icon_name"] as? String, "video.fill")
        XCTAssertNil(object["iconName"])
    }

    func testSubscriptionDetailsRoundTrip() throws {
        let expiry = Date(timeIntervalSince1970: 1_800_000_000)
        let row = SupabaseSubscriptionRow(
            name: "Discord",
            iconName: "bubble.left.fill",
            url: "https://example.com/invite",
            planName: "Nitro",
            expiresAt: expiry,
            details: "One family slot"
        )

        let data = try JSONEncoder().encode(row)
        let decoded = try JSONDecoder().decode(SupabaseSubscriptionRow.self, from: data)

        XCTAssertEqual(decoded.planName, "Nitro")
        XCTAssertEqual(decoded.expiresAt, expiry)
        XCTAssertEqual(decoded.details, "One family slot")
        XCTAssertEqual(decoded.toLocalUserSubscription().brandAssetName, "Brand-discord")
    }

    func testSubscriptionLifecycleRoundTrip() throws {
        let started = Date(timeIntervalSince1970: 1_700_000_000)
        let expiry = Date(timeIntervalSince1970: 1_702_592_000)
        let row = SupabaseSubscriptionRow(
            name: "Nintendo Switch Online",
            iconName: "gamecontroller.fill",
            url: nil,
            planName: "Family",
            expiresAt: expiry,
            startedAt: started,
            billingCycleId: "12m",
            autoRenew: true,
            sharedSlots: 6
        )

        let decoded = try JSONDecoder().decode(
            SupabaseSubscriptionRow.self,
            from: JSONEncoder().encode(row)
        )

        XCTAssertEqual(decoded.startedAt, started)
        XCTAssertEqual(decoded.billingCycleId, "12m")
        XCTAssertEqual(decoded.autoRenew, true)
        XCTAssertEqual(decoded.sharedSlots, 6)
    }

    func testSubscriptionCatalogUsesProviderSpecificOptions() throws {
        let playStation = try XCTUnwrap(SubscriptionCatalog.definition(named: "PlayStation Plus"))
        XCTAssertEqual(playStation.plans.map(\.name), ["Essential", "Extra", "Premium"])

        let nintendo = try XCTUnwrap(SubscriptionCatalog.definition(named: "Nintendo Switch Online"))
        let family = try XCTUnwrap(nintendo.plans.first(where: { $0.name == "Family" }))
        XCTAssertEqual(family.maximumSlots, 8)
        XCTAssertEqual(family.cycles.map(\.id), ["12m"])

        let discord = try XCTUnwrap(SubscriptionCatalog.definition(named: "Discord"))
        XCTAssertEqual(discord.plans.map(\.name), ["Nitro Basic", "Nitro"])
    }

    func testLocalCatalogFindsFortniteWithoutNetwork() {
        let results = GameCatalog.search("fortnite")

        XCTAssertEqual(results.first?.name, "Fortnite")
    }

    func testCustomGameNameIsSanitized() {
        XCTAssertEqual(GameNameValidator.sanitized("  Final   Fantasy XIV\n"), "Final Fantasy XIV")
        XCTAssertNil(GameNameValidator.sanitized("A"))
        XCTAssertNil(GameNameValidator.sanitized(String(repeating: "x", count: 81)))
    }

    func testGameNamesAreDeduplicatedCaseInsensitively() {
        let names = GameNameValidator.uniqueNames(["Fortnite", " fortnite ", "Minecraft"])

        XCTAssertEqual(names, ["Fortnite", "Minecraft"])
    }

    func testProfileUsernameValidation() {
        XCTAssertEqual(ProfileInputValidator.username("  player_one  "), "player_one")
        XCTAssertNil(ProfileInputValidator.username("ab"))
        XCTAssertNil(ProfileInputValidator.username(String(repeating: "p", count: 31)))
        XCTAssertNil(ProfileInputValidator.username("player\nname"))
    }
}
