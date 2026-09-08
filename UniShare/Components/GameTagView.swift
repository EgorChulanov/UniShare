import SwiftUI

struct GameTagView: View {
    let tag: GameTag
    var showCover: Bool = true

    @State private var coverImage: UIImage?
    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        HStack(spacing: 8) {
            if showCover {
                Group {
                    if let image = coverImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                    } else {
                        theme.effectiveCardColor
                            .overlay(
                                Image(systemName: "gamecontroller.fill")
                                    .foregroundColor(theme.effectivePrimary.opacity(0.7))
                                    .font(.system(size: 12))
                            )
                    }
                }
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            Text(tag.name)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.effectiveTextColor)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .glass(cornerRadius: 10)
        .task(id: tag.coverUrl) {
            guard let url = tag.coverUrl else { return }
            coverImage = await GameIconCacheService.shared.loadImage(from: url)
        }
    }
}

// MARK: - Horizontal scrollable tag list

struct GameTagsScrollView: View {
    let tags: [GameTag]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tags) { tag in
                    GameTagView(tag: tag)
                }
            }
            .padding(.horizontal, 16)
        }
    }
}
