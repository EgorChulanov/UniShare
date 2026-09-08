import XCTest
@testable import UniShare

final class PasswordPolicyTests: XCTestCase {
    func testAcceptsStrongPassword() {
        XCTAssertTrue(PasswordPolicy.isValid("UniShare-42!"))
    }

    func testRejectsMissingCharacterClassesAndShortPasswords() {
        XCTAssertFalse(PasswordPolicy.isValid("Short1!"))
        XCTAssertFalse(PasswordPolicy.isValid("UNISHARE-42!"))
        XCTAssertFalse(PasswordPolicy.isValid("unishare-42!"))
        XCTAssertFalse(PasswordPolicy.isValid("UniShare-Test!"))
        XCTAssertFalse(PasswordPolicy.isValid("UniShare4200"))
    }
}
