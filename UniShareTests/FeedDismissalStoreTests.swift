import XCTest
@testable import UniShare

final class FeedDismissalStoreTests: XCTestCase {
    private var defaults: UserDefaults!
    private var store: FeedDismissalStore!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "FeedDismissalStoreTests")
        defaults.removePersistentDomain(forName: "FeedDismissalStoreTests")
        store = FeedDismissalStore(defaults: defaults, storageKey: "test.dismissals")
    }

    func testDismissalIsScopedByContextAndExpiresAfterTwentyFourHours() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        store.record(userID: "profile-1", context: "exchange", now: now)

        XCTAssertTrue(store.contains(userID: "profile-1", context: "exchange", now: now.addingTimeInterval(86_399)))
        XCTAssertFalse(store.contains(userID: "profile-1", context: "skills", now: now))
        XCTAssertFalse(store.contains(userID: "profile-1", context: "exchange", now: now.addingTimeInterval(86_400)))
    }

    func testUndoRemovesDismissal() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        store.record(userID: "profile-1", context: "exchange", now: now)

        store.remove(userID: "profile-1", context: "exchange", now: now)

        XCTAssertFalse(store.contains(userID: "profile-1", context: "exchange", now: now))
    }
}
