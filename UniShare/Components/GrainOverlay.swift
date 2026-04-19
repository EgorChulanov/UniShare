import SwiftUI

// High-contrast film-grain texture. Use as overlay on any background.
// Increase opacity for stronger effect (0.08 = subtle, 0.18 = strong, 0.3+ = very visible).

struct GrainOverlay: View {
    var opacity: Double = 0.14
    var blendMode: BlendMode = .overlay

    // Dense high-contrast noise: 1 px and occasional 2 px dots, white/black only.
    private static let grainImage: UIImage = {
        let size = CGSize(width: 200, height: 200)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            let total = Int(size.width * size.height * 1.4)
            for _ in 0 ..< total {
                let x = CGFloat.random(in: 0 ..< size.width)
                let y = CGFloat.random(in: 0 ..< size.height)
                let r = Double.random(in: 0...1)
                // High-contrast distribution: 50% bright, 50% dark
                let bright: CGFloat = r < 0.5
                    ? CGFloat.random(in: 0.75...1.0)
                    : CGFloat.random(in: 0...0.25)
                // ~15% of dots are 2×2 px for coarser texture
                let dotSize: CGFloat = r < 0.15 ? 2.0 : 1.0
                UIColor(white: bright, alpha: 1).setFill()
                UIBezierPath(rect: CGRect(x: x, y: y, width: dotSize, height: dotSize)).fill()
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

struct GrainBackgroundModifier: ViewModifier {
    let color: Color
    var grainOpacity: Double

    func body(content: Content) -> some View {
        content.background(
            ZStack {
                color
                GrainOverlay(opacity: grainOpacity)
            }
            .ignoresSafeArea()
        )
    }
}

extension View {
    func grainBackground(_ color: Color, opacity: Double = 0.14) -> some View {
        modifier(GrainBackgroundModifier(color: color, grainOpacity: opacity))
    }
}
