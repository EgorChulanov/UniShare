import SwiftUI

struct LiquidSegmentedPicker<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String

    @EnvironmentObject private var theme: ThemeManager
    @Namespace private var selectionAnimation

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.self) { option in
                Button {
                    HapticsManager.shared.impact(.light)
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) {
                        selection = option
                    }
                } label: {
                    Text(title(option))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(selection == option ? Color.white : theme.effectiveSecondaryTextColor)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background {
                            if selection == option {
                                Capsule()
                                    .fill(theme.effectivePrimary)
                                    .matchedGeometryEffect(id: "selection", in: selectionAnimation)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == option ? .isSelected : [])
            }
        }
        .padding(4)
        .liquidGlassSurface(in: Capsule())
    }
}

private extension View {
    @ViewBuilder
    func liquidGlassSurface<S: Shape>(in shape: S) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(.regular, in: shape)
        } else {
            background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(Color.primary.opacity(0.10), lineWidth: 0.75))
                .shadow(color: Color.black.opacity(0.08), radius: 12, y: 5)
        }
    }
}
