import SwiftUI

struct AIView: View {
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var localization: LocalizationManager

    @StateObject private var vm: AIViewModel

    init() {
        _vm = StateObject(wrappedValue: AIViewModel(
            chatGPT: ChatGPTService(),
            rawg: RawgService(),
            firestore: FirestoreService(),
            auth: FirebaseAuthService()
        ))
    }

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Quick commands auto-scroll
                    quickCommandsRow

                    // Messages
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                if vm.messages.isEmpty {
                                    emptyState
                                }
                                ForEach(vm.messages) { msg in
                                    AIMessageView(message: msg)
                                        .id(msg.id)
                                }
                                if vm.isThinking {
                                    HStack {
                                        ThinkingBubble()
                                        Spacer()
                                    }
                                    .padding(.horizontal, 16)
                                    .id("thinking")
                                }
                            }
                            .padding(.vertical, 12)
                        }
                        .onChange(of: vm.messages.count) { _ in
                            withAnimation {
                                if let last = vm.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                            }
                        }
                        .onChange(of: vm.isThinking) { thinking in
                            if thinking { withAnimation { proxy.scrollTo("thinking", anchor: .bottom) } }
                        }
                    }

                    // Input bar
                    inputBar
                }
            }
            .navigationTitle("ai.title".localized)
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Quick Commands

    private var quickCommandsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(vm.quickCommands, id: \.key) { command in
                    Button {
                        HapticsManager.shared.impact(.light)
                        vm.sendQuickCommand(command.key)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: command.icon)
                                .font(.system(size: 13))
                                .foregroundColor(theme.effectivePrimary)
                            Text(command.key.localized)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.effectiveTextColor)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .glass(cornerRadius: 20)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 8)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(theme.effectivePrimary.opacity(0.15))
                    .frame(width: 80, height: 80)
                Image(systemName: "sparkles")
                    .font(.system(size: 32))
                    .foregroundColor(theme.effectivePrimary)
            }
            Text("ai.title".localized)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(theme.effectiveTextColor)
            Text("Ask me anything about games, exchange tips, or get personalized recommendations!")
                .font(.system(size: 14))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .padding(.top, 40)
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        VStack(spacing: 8) {
            if vm.inputText.count > 80 {
                Text("\(vm.inputText.count)/\(AppConstants.AI.maxMessageLength)")
                    .font(.system(size: 11))
                    .foregroundColor(vm.inputText.count >= AppConstants.AI.maxMessageLength ? .red : theme.effectiveSecondaryTextColor)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.horizontal, 20)
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField("ai.placeholder".localized, text: $vm.inputText, axis: .vertical)
                    .font(.system(size: 15))
                    .foregroundColor(theme.effectiveTextColor)
                    .accentColor(theme.effectivePrimary)
                    .lineLimit(1...5)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(theme.effectiveCardColor)
                    .cornerRadius(22)
                    .onChange(of: vm.inputText) { text in
                        if text.count > AppConstants.AI.maxMessageLength {
                            vm.inputText = String(text.prefix(AppConstants.AI.maxMessageLength))
                        }
                    }

                Button {
                    Task { await vm.sendMessage() }
                } label: {
                    ZStack {
                        if vm.isThinking {
                            Circle()
                                .fill(theme.effectivePrimary.opacity(0.3))
                                .frame(width: 40, height: 40)
                            ProgressView().scaleEffect(0.7).tint(theme.effectivePrimary)
                        } else {
                            Circle()
                                .fill(vm.inputIsValid
                                    ? LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    : LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor], startPoint: .topLeading, endPoint: .bottomTrailing))
                                .frame(width: 40, height: 40)
                            Image(systemName: "arrow.up")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(vm.inputIsValid ? .white : theme.effectiveSecondaryTextColor)
                        }
                    }
                }
                .disabled(!vm.inputIsValid || vm.isThinking)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(
            theme.effectiveBackground
                .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: -4)
        )
    }
}

// MARK: - AIMessageView

struct AIMessageView: View {
    let message: AIMessage
    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        VStack(alignment: message.isFromUser ? .trailing : .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 8) {
                if message.isFromUser { Spacer(minLength: 60) }

                if !message.isFromUser {
                    ZStack {
                        Circle().fill(theme.effectivePrimary.opacity(0.2)).frame(width: 32, height: 32)
                        Image(systemName: "sparkles").font(.system(size: 14)).foregroundColor(theme.effectivePrimary)
                    }
                }

                Text(message.text)
                    .font(.system(size: 15))
                    .foregroundColor(message.isFromUser ? .white : theme.effectiveTextColor)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        message.isFromUser ?
                        LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .leading, endPoint: .trailing) :
                        LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor], startPoint: .leading, endPoint: .trailing)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                if message.isFromUser { Spacer(minLength: 0) }
            }

            // Game cards
            if !message.gameCards.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(message.gameCards) { card in
                            AIGameCardView(card: card)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - AIGameCardView

struct AIGameCardView: View {
    let card: AIGameCard
    @State private var coverImage: UIImage?
    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                if let image = coverImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    theme.effectiveCardColor
                    Image(systemName: "gamecontroller.fill")
                        .foregroundColor(theme.effectivePrimary.opacity(0.6))
                        .font(.system(size: 24))
                }
            }
            .frame(width: 150, height: 90)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(card.name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.effectiveTextColor)
                .lineLimit(2)
                .frame(width: 150, alignment: .leading)

            if let rating = card.rating {
                HStack(spacing: 4) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.yellow)
                    Text(String(format: "%.1f", rating))
                        .font(.system(size: 11))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
            }
        }
        .frame(width: 150)
        .task(id: card.coverUrl) {
            guard let url = card.coverUrl else { return }
            coverImage = await GameIconCacheService.shared.loadImage(from: url)
        }
    }
}
