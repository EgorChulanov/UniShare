import SwiftUI

struct CommunityStoriesRail: View {
    let stories: [CommunityStory]
    let onSelect: (CommunityStory) -> Void

    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 12) {
                ForEach(stories) { story in
                    Button { onSelect(story) } label: {
                        CommunityStoryCard(story: story)
                            .environmentObject(theme)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
    }
}

private struct CommunityStoryCard: View {
    let story: CommunityStory
    @EnvironmentObject private var theme: ThemeManager

    private var accent: Color { Color(hex: story.accentHex) }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [accent.opacity(0.95), accent.opacity(0.46), theme.effectiveCardColor],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            if let imageUrl = story.imageUrl, !imageUrl.isEmpty {
                AsyncImageView(url: imageUrl)
                    .scaledToFill()
                    .frame(width: 106, height: 106)
                    .clipped()
                    .overlay(Color.black.opacity(0.18))
            } else {
                Circle()
                    .fill(Color.white.opacity(0.12))
                    .frame(width: 92, height: 92)
                    .offset(x: 54, y: -68)
            }

            LinearGradient(
                colors: [.clear, .black.opacity(0.78)],
                startPoint: .center,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 7) {
                Image(systemName: story.symbol)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(.white.opacity(0.18))
                    .clipShape(Circle())

                Spacer(minLength: 4)

                Text(story.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)

            }
            .padding(11)
        }
        .frame(width: 106, height: 106)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(story.isSeen ? Color.white.opacity(0.12) : accent, lineWidth: story.isSeen ? 1 : 2.5)
        }
        .opacity(story.isSeen ? 0.72 : 1)
    }
}

struct CommunityStoryViewer: View {
    let story: CommunityStory

    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private var accent: Color { Color(hex: story.accentHex) }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [accent, accent.opacity(0.58), Color.black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            if let imageUrl = story.imageUrl, !imageUrl.isEmpty {
                AsyncImageView(url: imageUrl)
                    .scaledToFill()
                    .ignoresSafeArea()
                    .overlay(Color.black.opacity(0.38).ignoresSafeArea())
            }

            VStack(alignment: .leading, spacing: 0) {
                Capsule()
                    .fill(.white.opacity(0.92))
                    .frame(height: 3)
                    .padding(.top, 8)

                HStack {
                    Label("UniShare", systemImage: story.symbol)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    Spacer()

                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(.black.opacity(0.22))
                            .clipShape(Circle())
                    }
                }
                .padding(.top, 12)

                Spacer()

                Image(systemName: story.symbol)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 64, height: 64)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .padding(.bottom, 22)

                Text(story.title)
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)

                Text(story.subtitle)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white.opacity(0.82))
                    .padding(.top, 10)

                Text(story.body)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white.opacity(0.78))
                    .lineSpacing(5)
                    .padding(.top, 18)

                if let title = story.ctaTitle,
                   let value = story.ctaUrl,
                   let url = URL(string: value) {
                    Button { openURL(url) } label: {
                        Text(title)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(accent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 26)
                }
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 34)
        }
        .preferredColorScheme(.dark)
    }
}
