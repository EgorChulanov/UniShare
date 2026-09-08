import SwiftUI

extension View {
    func onTapWithHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light, action: @escaping () -> Void) -> some View {
        self.onTapGesture {
            HapticsManager.shared.impact(style)
            action()
        }
    }
}
