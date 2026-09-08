import Foundation

enum PasswordPolicy {
    static let minimumLength = 10

    static func isValid(_ password: String) -> Bool {
        password.count >= minimumLength
            && password.rangeOfCharacter(from: .lowercaseLetters) != nil
            && password.rangeOfCharacter(from: .uppercaseLetters) != nil
            && password.rangeOfCharacter(from: .decimalDigits) != nil
            && password.rangeOfCharacter(from: CharacterSet.alphanumerics.inverted) != nil
    }
}
