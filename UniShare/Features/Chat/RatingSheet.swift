import SwiftUI

struct RatingSheet: View {
    let partnerUsername: String
    let onSubmit: (Int, String?) -> Void

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss

    @State private var rating = 0
    @State private var reviewText = ""
    @State private var submitted = false

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()
                GrainOverlay(opacity: 0.14)

                VStack(spacing: 28) {
                    // Stars
                    VStack(spacing: 12) {
                        Text("Оцени @\(partnerUsername)")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(theme.effectiveTextColor)
                            .multilineTextAlignment(.center)

                        Text("Как прошёл обмен?")
                            .font(.system(size: 14))
                            .foregroundColor(theme.effectiveSecondaryTextColor)

                        HStack(spacing: 14) {
                            ForEach(1...5, id: \.self) { star in
                                Button {
                                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                                        rating = star
                                    }
                                    HapticsManager.shared.impact(.light)
                                } label: {
                                    Image(systemName: star <= rating ? "star.fill" : "star")
                                        .font(.system(size: 36))
                                        .foregroundColor(star <= rating ? .yellow : theme.effectiveSecondaryTextColor.opacity(0.4))
                                        .scaleEffect(star <= rating ? 1.15 : 1.0)
                                }
                            }
                        }
                        .padding(.top, 4)
                    }

                    // Review text
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Короткий отзыв (необязательно)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.effectiveSecondaryTextColor)

                        TextEditor(text: $reviewText)
                            .font(.system(size: 15))
                            .foregroundColor(theme.effectiveTextColor)
                            .accentColor(theme.effectivePrimary)
                            .scrollContentBackground(.hidden)
                            .padding(12)
                            .frame(height: 110)
                            .background(theme.effectiveCardColor)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14)
                                .stroke(theme.effectiveSecondaryTextColor.opacity(0.2), lineWidth: 1))
                    }

                    // Submit button
                    Button {
                        guard rating > 0 else { return }
                        let text = reviewText.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSubmit(rating, text.isEmpty ? nil : text)
                        submitted = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { dismiss() }
                    } label: {
                        ZStack {
                            if submitted {
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark")
                                    Text("Отправлено!")
                                }
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                            } else {
                                Text("Отправить отзыв")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(rating > 0 ? .white : theme.effectiveSecondaryTextColor)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(
                            rating > 0
                                ? LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                                 startPoint: .leading, endPoint: .trailing)
                                : LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor],
                                                 startPoint: .leading, endPoint: .trailing)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(rating == 0 || submitted)

                    Spacer()
                }
                .padding(.horizontal, 24)
                .padding(.top, 32)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Пропустить") { dismiss() }
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
