import SwiftUI

// Interactive gradient bubble for the AI Assistant tab.
// The angular gradient slowly rotates. It pulses when the AI is thinking,
// follows the user's finger while dragging, and emits a ripple on tap.

struct AIBubbleView: View {
    var isThinking: Bool = false

    @State private var rotation: Double = 0
    @State private var dragOffset: CGSize = .zero
    @State private var showRipple: Bool = false
    @State private var rippleScale: CGFloat = 1
    @State private var rippleOpacity: Double = 0.5
    @State private var appeared: Bool = false

    @EnvironmentObject var theme: ThemeManager

    private let bubbleSize: CGFloat = 200
    private let glowSize: CGFloat = 270

    var body: some View {
        ZStack {
            // ── Outer ambient glow ────────────────────────────────────
            Circle()
                .fill(
                    AngularGradient(
                        colors: gradientColors,
                        center: .center
                    )
                )
                .frame(width: glowSize, height: glowSize)
                .blur(radius: 36)
                .opacity(0.38)
                .rotationEffect(.degrees(rotation))
                .scaleEffect(isThinking ? 1.08 : 1.0)
                .animation(thinkingAnimation, value: isThinking)

            // ── Ripple ring (on tap) ──────────────────────────────────
            if showRipple {
                Circle()
                    .stroke(Color.white.opacity(rippleOpacity), lineWidth: 2)
                    .frame(width: bubbleSize, height: bubbleSize)
                    .scaleEffect(rippleScale)
            }

            // ── Main bubble ───────────────────────────────────────────
            Circle()
                .fill(
                    AngularGradient(
                        colors: gradientColors,
                        center: .center
                    )
                )
                .frame(width: bubbleSize, height: bubbleSize)
                .rotationEffect(.degrees(rotation))
                .scaleEffect(isThinking ? 1.06 : (appeared ? 1.0 : 0.01))
                .animation(thinkingAnimation, value: isThinking)
                .shadow(color: theme.effectivePrimary.opacity(0.55), radius: 32, x: 0, y: 0)
                .overlay(
                    // Specular gloss
                    Ellipse()
                        .fill(Color.white.opacity(0.12))
                        .frame(width: bubbleSize * 0.5, height: bubbleSize * 0.28)
                        .offset(x: -30, y: -50)
                        .blur(radius: 8)
                )

            // ── Thinking label inside bubble ──────────────────────────
            if isThinking {
                ThinkingBubble()
                    .scaleEffect(0.7)
                    .transition(.opacity.combined(with: .scale))
            }
        }
        .offset(dragOffset)
        .scaleEffect(appeared ? 1 : 0.01)
        .animation(.spring(response: 0.7, dampingFraction: 0.6), value: appeared)
        .gesture(dragGesture)
        .onTapGesture { triggerRipple() }
        .onAppear {
            appeared = true
            startRotation()
        }
    }

    // MARK: - Gradient

    private var gradientColors: [Color] {
        [
            theme.effectivePrimary,          // Mocha / primary
            theme.effectiveTertiary,         // Peri / tertiary
            theme.effectivePrimary.opacity(0.7),
            Color(hex: "#FFBE98"),           // Peach Fuzz accent
            theme.effectiveTertiary.opacity(0.8),
            theme.effectivePrimary,
        ]
    }

    // MARK: - Animations

    private var thinkingAnimation: Animation {
        .easeInOut(duration: 0.75).repeatForever(autoreverses: true)
    }

    private func startRotation() {
        withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
            rotation = 360
        }
    }

    // MARK: - Drag

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                dragOffset = CGSize(
                    width: value.translation.width * 0.7,
                    height: value.translation.height * 0.7
                )
            }
            .onEnded { _ in
                withAnimation(.spring(response: 0.55, dampingFraction: 0.55)) {
                    dragOffset = .zero
                }
            }
    }

    // MARK: - Ripple

    private func triggerRipple() {
        HapticsManager.shared.impact(.light)
        showRipple = true
        rippleScale = 1
        rippleOpacity = 0.5
        withAnimation(.easeOut(duration: 0.7)) {
            rippleScale = 2
            rippleOpacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) {
            showRipple = false
            rippleScale = 1
        }
    }
}
