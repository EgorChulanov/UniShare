import UIKit
import ObjectiveC

// MARK: - Global Manrope Font Swizzle
// Replaces UIFont.systemFont(...) with Manrope everywhere in the app.

enum ManropeFontSwizzle {
    static func apply() {
        swizzle(#selector(UIFont.systemFont(ofSize:weight:)), with: #selector(UIFont._manrope(ofSize:weight:)))
        swizzle(#selector(UIFont.systemFont(ofSize:)),        with: #selector(UIFont._manrope(ofSize:)))
        swizzle(#selector(UIFont.boldSystemFont(ofSize:)),    with: #selector(UIFont._manropeBold(ofSize:)))
    }

    private static func swizzle(_ original: Selector, with custom: Selector) {
        guard let orig = class_getClassMethod(UIFont.self, original),
              let cust = class_getClassMethod(UIFont.self, custom) else { return }
        method_exchangeImplementations(orig, cust)
    }
}

extension UIFont {
    // After swizzle: calling _manrope... will invoke the ORIGINAL systemFont as fallback.

    @objc class func _manrope(ofSize size: CGFloat, weight: UIFont.Weight) -> UIFont {
        let name = _manropeName(for: weight)
        return UIFont(name: name, size: size) ?? _manrope(ofSize: size, weight: weight)
    }

    @objc class func _manrope(ofSize size: CGFloat) -> UIFont {
        return UIFont(name: "Manrope-Regular", size: size) ?? _manrope(ofSize: size)
    }

    @objc class func _manropeBold(ofSize size: CGFloat) -> UIFont {
        return UIFont(name: "Manrope-Bold", size: size) ?? _manropeBold(ofSize: size)
    }

    private class func _manropeName(for weight: UIFont.Weight) -> String {
        switch weight {
        case .black, .heavy:        return "Manrope-ExtraBold"
        case .bold:                 return "Manrope-Bold"
        case .semibold:             return "Manrope-SemiBold"
        case .medium:               return "Manrope-Medium"
        default:                    return "Manrope-Regular"
        }
    }
}
