import SwiftUI

// Tiled noise texture for the grain/roughness background effect.
// Use as an overlay on any background:
//   Color.black.overlay(GrainOverlay())

struct GrainOverlay: View {
    var opacity: Double = 0.055
    var blendMode: BlendMode = .overlay

    // Generated once, then tiled — zero per-frame cost.
    private static let grainImage: UIImage = {
        let size = CGSize(width: 256, height: 256)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            for _ in 0 ..< Int(size.width * size.height * 0.6) {
                let x = CGFloat.random(in: 0 ..< size.width)
                let y = CGFloat.random(in: 0 ..< size.height)
                let bright = CGFloat.random(in: 0 ... 1)
                UIColor(white: bright, alpha: 1).setFill()
                UIBezierPath(rect: CGRect(x: x, y: y, width: 1, height: 1)).fill()
            }
        }
    }()

    var body: some View {
        Image(uiImage: Self.grainImage)
            .resizable(resizingMode: .tile)
            .opacity(opacity)
            .blendMode(blendMode)
            .allowsHitTesting(false)
            .ignoresSafeArea()
    }
}

// Convenience modifier — use instead of theme.effectiveBackground.ignoresSafeArea()
struct GrainBackgroundModifier: ViewModifier {
    let color: Color
    var grainOpacity: Double

    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    color
                    GrainOverlay(opacity: grainOpacity)
                }
                .ignoresSafeArea()
            )
    }
}

extension View {
    func grainBackground(_ color: Color, opacity: Double = 0.055) -> some View {
        modifier(GrainBackgroundModifier(color: color, grainOpacity: opacity))
    }
}
