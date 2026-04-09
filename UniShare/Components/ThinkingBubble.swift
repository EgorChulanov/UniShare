import SwiftUI

struct ThinkingBubble: View {
    @State private var phase = 0
    @EnvironmentObject var theme: ThemeManager

    private let timer = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(theme.effectivePrimary)
                    .frame(width: 8, height: 8)
                    .scaleEffect(phase == i ? 1.4 : 0.8)
                    .opacity(phase == i ? 1.0 : 0.4)
                    .animation(.spring(response: 0.3), value: phase)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .glass(cornerRadius: 18)
        .onReceive(timer) { _ in
            phase = (phase + 1) % 3
        }
    }
}

#Preview {
    ThinkingBubble()
        .environmentObject(ThemeManager.shared)
        .padding()
        .background(Color(hex: "#1A1A2E"))
}
