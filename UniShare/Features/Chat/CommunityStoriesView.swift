import SwiftUI
import Combine

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

            StoryArtwork(source: story.imageUrl)
                .frame(width: 106, height: 106)
                .overlay(Color.black.opacity(0.12))

            LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .center, endPoint: .bottom)

            VStack(alignment: .leading, spacing: 7) {
                Image(systemName: story.symbol)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(.white.opacity(0.18), in: Circle())
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
        .opacity(story.isSeen ? 0.78 : 1)
    }
}

struct CommunityStoryViewer: View {
    let stories: [CommunityStory]
    let initialStoryID: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var pageIndex: Int
    @State private var progress: Double = 0
    @State private var isPaused = false

    private let timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()
    private let slideDuration = 7.0

    init(stories: [CommunityStory], initialStoryID: String) {
        self.stories = stories
        self.initialStoryID = initialStoryID
        let pages = Self.makePages(from: stories)
        _pageIndex = State(initialValue: pages.firstIndex(where: { $0.story.id == initialStoryID }) ?? 0)
    }

    private var pages: [StoryPage] { Self.makePages(from: stories) }

    var body: some View {
        GeometryReader { geometry in
            let usesCenteredCanvas = horizontalSizeClass == .regular && geometry.size.width > 600
            let storyHeight = usesCenteredCanvas
                ? min(geometry.size.height, geometry.size.width * 16 / 9)
                : geometry.size.height
            let storyWidth = usesCenteredCanvas
                ? min(geometry.size.width, storyHeight * 9 / 16)
                : geometry.size.width
            let viewportMidX = geometry.frame(in: .global).midX
            ZStack {
                Color.black.ignoresSafeArea()

                TabView(selection: $pageIndex) {
                    ForEach(pages.indices, id: \.self) { index in
                        page(index: index, storyWidth: storyWidth, viewportMidX: viewportMidX)
                            .frame(width: storyWidth, height: storyHeight)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .indexViewStyle(.page(backgroundDisplayMode: .never))
                .frame(width: storyWidth, height: storyHeight)
                .clipShape(RoundedRectangle(cornerRadius: geometry.size.width > storyWidth ? 26 : 0, style: .continuous))
            }
            .clipped()
            .contentShape(Rectangle())
            .simultaneousGesture(
                SpatialTapGesture().onEnded { value in
                    if value.location.x < geometry.size.width * 0.34 { previous() }
                    else if value.location.x > geometry.size.width * 0.66 { next() }
                }
            )
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.12, maximumDistance: 30)
                    .onChanged { _ in isPaused = true }
                    .onEnded { _ in isPaused = false }
            )
        }
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
        .onChange(of: pageIndex) { _ in progress = 0 }
        .onReceive(timer) { _ in
            guard !isPaused, scenePhase == .active else { return }
            progress += 0.05 / slideDuration
            if progress >= 1 { next() }
        }
    }

    private func page(index: Int, storyWidth: CGFloat, viewportMidX: CGFloat) -> some View {
        let page = pages[index]
        return GeometryReader { proxy in
            let relativeOffset = (proxy.frame(in: .global).midX - viewportMidX) / max(storyWidth, 1)

            StoryPageView(
                page: page,
                pageIndexInStory: page.slideIndex,
                storyPageCount: page.story.slides.count,
                progress: index == pageIndex ? progress : 0,
                isPaused: isPaused,
                onClose: { dismiss() }
            )
            .rotation3DEffect(
                .degrees(Double(relativeOffset) * -32),
                axis: (x: 0, y: 1, z: 0),
                anchor: relativeOffset > 0 ? .leading : .trailing,
                perspective: 0.68
            )
            .opacity(max(0.72, 1 - abs(relativeOffset) * 0.2))
        }
    }

    private func next() {
        guard pageIndex + 1 < pages.count else { dismiss(); return }
        progress = 0
        withAnimation(.easeInOut(duration: 0.28)) {
            pageIndex += 1
        }
    }

    private func previous() {
        progress = 0
        guard pageIndex > 0 else { return }
        withAnimation(.easeInOut(duration: 0.28)) {
            pageIndex -= 1
        }
    }

    private static func makePages(from stories: [CommunityStory]) -> [StoryPage] {
        stories.flatMap { story in
            story.slides.enumerated().map { StoryPage(story: story, slide: $0.element, slideIndex: $0.offset) }
        }
    }
}

private struct StoryPage: Identifiable {
    let story: CommunityStory
    let slide: CommunityStorySlide
    let slideIndex: Int
    var id: String { "\(story.id)-\(slideIndex)" }
}

private struct StoryPageView: View {
    let page: StoryPage
    let pageIndexInStory: Int
    let storyPageCount: Int
    let progress: Double
    let isPaused: Bool
    let onClose: () -> Void

    @Environment(\.openURL) private var openURL

    private var accent: Color { Color(hex: page.story.accentHex) }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [accent, accent.opacity(0.55), .black],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                StoryArtwork(source: page.slide.imageUrl ?? page.story.imageUrl)
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .overlay(
                        LinearGradient(
                            colors: [.black.opacity(0.08), .black.opacity(0.22), .black.opacity(0.9)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                VStack(alignment: .leading, spacing: 0) {
                    progressHeader

                    Spacer(minLength: 24)

                    storyContent(maxHeight: geometry.size.height * 0.56)
                }
                .padding(.horizontal, 20)
                .padding(.top, max(geometry.safeAreaInsets.top, 8))
                .padding(.bottom, max(geometry.safeAreaInsets.bottom, 18))
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
    }

    private var progressHeader: some View {
        VStack(spacing: 10) {
            HStack(spacing: 5) {
                ForEach(0..<storyPageCount, id: \.self) { index in
                    GeometryReader { geometry in
                        Capsule()
                            .fill(Color.white.opacity(0.3))
                            .overlay(alignment: .leading) {
                                Capsule()
                                    .fill(Color.white)
                                    .frame(width: geometry.size.width * fillAmount(for: index))
                            }
                    }
                    .frame(height: 3)
                }
            }

            HStack {
                Label("UniShare", systemImage: page.slide.symbol)
                    .font(.system(size: 14, weight: .bold))
                if isPaused {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 10, weight: .black))
                        .transition(.scale.combined(with: .opacity))
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .frame(width: 36, height: 36)
                        .background(.black.opacity(0.24), in: Circle())
                }
            }
            .foregroundStyle(.white)
        }
    }

    private func storyContent(maxHeight: CGFloat) -> some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                Image(systemName: page.slide.symbol)
                    .font(.system(size: 24, weight: .bold))
                    .frame(width: 54, height: 54)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                    .padding(.bottom, 16)

                Text(page.slide.title)
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.72)
                    .fixedSize(horizontal: false, vertical: true)

                if !page.slide.subtitle.isEmpty {
                    Text(page.slide.subtitle)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.86))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                }

                Text(page.slide.body)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white.opacity(0.84))
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14)

                storyAction
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxHeight: maxHeight)
    }

    @ViewBuilder
    private var storyAction: some View {
        if pageIndexInStory == storyPageCount - 1,
           let title = page.story.ctaTitle,
           let value = page.story.ctaUrl,
           let url = URL(string: value) {
            Button { openURL(url) } label: {
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(accent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(.white, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 20)
        }
    }

    private func fillAmount(for index: Int) -> CGFloat {
        if index < pageIndexInStory { return 1 }
        if index > pageIndexInStory { return 0 }
        return CGFloat(min(max(progress, 0), 1))
    }
}

private struct StoryArtwork: View {
    let source: String?

    var body: some View {
        Group {
            if let source, source.hasPrefix("asset:") {
                Image(String(source.dropFirst("asset:".count)))
                    .resizable()
                    .scaledToFill()
            } else if let source, !source.isEmpty {
                AsyncImageView(url: source)
                    .scaledToFill()
            } else {
                LinearGradient(colors: [.clear, .black.opacity(0.18)], startPoint: .top, endPoint: .bottom)
            }
        }
        .clipped()
    }
}
