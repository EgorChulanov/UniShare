import SwiftUI
import PhotosUI

struct ChatView: View {
    let chat: Chat

    @EnvironmentObject var theme: ThemeManager
    @StateObject private var vm: ChatViewModel
    @State private var photoItem: PhotosPickerItem?
    @State private var showReportSheet = false

    init(chat: Chat) {
        self.chat = chat
        _vm = StateObject(wrappedValue: ChatViewModel(
            chat: chat,
            auth: FirebaseAuthService(),
            firestore: FirestoreService(),
            storage: StorageService()
        ))
    }

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(vm.messages) { message in
                                MessageBubble(
                                    message: message,
                                    isFromMe: message.senderId == vm.myUid
                                )
                                .id(message.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                    .onChange(of: vm.messages.count) { _ in
                        if let last = vm.messages.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                inputBar
            }
        }
        .navigationTitle(vm.partnerProfile?.username ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text(vm.partnerProfile?.username ?? "")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.effectiveTextColor)
                    Text(vm.isPartnerOnline ? "chat.online".localized : "chat.offline".localized)
                        .font(.system(size: 12))
                        .foregroundColor(vm.isPartnerOnline ? .green : theme.effectiveSecondaryTextColor)
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button(role: .destructive) {
                        showReportSheet = true
                    } label: {
                        Label("chat.report".localized, systemImage: "flag")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundColor(theme.effectivePrimary)
                }
            }
        }
        .task { await vm.start() }
        .sheet(isPresented: $showReportSheet) {
            ReportSheet(username: vm.partnerProfile?.username ?? "")
                .environmentObject(theme)
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            PhotosPicker(selection: $photoItem, matching: .images) {
                Image(systemName: "photo")
                    .foregroundColor(theme.effectivePrimary)
                    .font(.system(size: 20))
                    .frame(width: 36, height: 36)
            }
            .onChange(of: photoItem) { item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        await vm.sendImage(image)
                        photoItem = nil
                    }
                }
            }

            TextField("chat.placeholder".localized, text: $vm.inputText, axis: .vertical)
                .font(.system(size: 15))
                .foregroundColor(theme.effectiveTextColor)
                .accentColor(theme.effectivePrimary)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(theme.effectiveCardColor)
                .cornerRadius(20)

            Button {
                Task { await vm.sendText() }
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing)
                                : LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                        .frame(width: 38, height: 38)
                    if vm.isSending {
                        ProgressView().scaleEffect(0.7).tint(.white)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(
                                vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    ? theme.effectiveSecondaryTextColor : .white
                            )
                    }
                }
            }
            .disabled(vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSending)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(theme.effectiveBackground)
        .overlay(alignment: .top) { Divider() }
    }
}

// MARK: - Report Sheet

struct ReportSheet: View {
    let username: String

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss

    private let reasons = [
        ("exclamationmark.bubble", "Spam"),
        ("hand.raised", "Inappropriate content"),
        ("person.fill.xmark", "Harassment or bullying"),
        ("questionmark.circle", "Fake profile"),
        ("person.badge.minus", "Underage user"),
        ("ellipsis.circle", "Other reason")
    ]

    @State private var selectedReason: String? = nil
    @State private var otherText = ""
    @State private var submitted = false

    var body: some View {
        NavigationView {
            ZStack {
                theme.effectiveBackground.ignoresSafeArea()

                if submitted {
                    submittedView
                } else {
                    reasonsList
                }
            }
            .navigationTitle("Report \(username)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("cancel".localized) { dismiss() }
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
                if !submitted {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Send") {
                            submitted = true
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(selectedReason != nil ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                        .disabled(selectedReason == nil)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var reasonsList: some View {
        ScrollView {
            VStack(spacing: 0) {
                Text("Why are you reporting this user?")
                    .font(.system(size: 14))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.top, 16)
                    .padding(.bottom, 12)

                VStack(spacing: 1) {
                    ForEach(reasons, id: \.1) { icon, reason in
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                selectedReason = reason
                            }
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: icon)
                                    .font(.system(size: 18))
                                    .foregroundColor(theme.effectivePrimary)
                                    .frame(width: 28)

                                Text(reason)
                                    .font(.system(size: 15))
                                    .foregroundColor(theme.effectiveTextColor)

                                Spacer()

                                if selectedReason == reason {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(theme.effectivePrimary)
                                        .transition(.scale.combined(with: .opacity))
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                            .background(
                                selectedReason == reason
                                    ? theme.effectivePrimary.opacity(0.08)
                                    : theme.effectiveCardColor
                            )
                        }
                        .buttonStyle(.plain)

                        Divider().padding(.leading, 62)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 16)

                // Extra text field when "Other reason" is selected
                if selectedReason == "Other reason" {
                    TextField("Add details (optional)", text: $otherText, axis: .vertical)
                        .font(.system(size: 14))
                        .foregroundColor(theme.effectiveTextColor)
                        .lineLimit(3...6)
                        .padding(14)
                        .background(theme.effectiveCardColor)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .padding(.bottom, 32)
        }
    }

    private var submittedView: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 56))
                .foregroundColor(.green)
            Text("Report submitted")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(theme.effectiveTextColor)
            Text("Thank you. We'll review your report and take action if needed.")
                .font(.system(size: 14))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Done") { dismiss() }
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 32).padding(.vertical, 12)
                .background(theme.effectivePrimary)
                .clipShape(Capsule())
        }
    }
}

// MARK: - MessageBubble

struct MessageBubble: View {
    let message: Message
    let isFromMe: Bool

    @EnvironmentObject var theme: ThemeManager

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            if isFromMe { Spacer(minLength: 50) }

            VStack(alignment: isFromMe ? .trailing : .leading, spacing: 4) {
                if let imageUrl = message.imageUrl {
                    AsyncImageView(url: imageUrl)
                        .frame(maxWidth: 220, maxHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }

                if let text = message.text, !text.isEmpty {
                    Text(text)
                        .font(.system(size: 15))
                        .foregroundColor(isFromMe ? .white : theme.effectiveTextColor)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            isFromMe
                                ? LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing)
                                : LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor],
                                                 startPoint: .leading, endPoint: .trailing)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                }

                HStack(spacing: 4) {
                    Text(message.createdAt.formatted(.dateTime.hour().minute()))
                        .font(.system(size: 10))
                        .foregroundColor(theme.effectiveSecondaryTextColor)

                    if isFromMe {
                        Image(systemName: message.isRead ? "checkmark.circle.fill" : "checkmark.circle")
                            .font(.system(size: 11))
                            .foregroundColor(message.isRead ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                    }
                }
            }

            if !isFromMe { Spacer(minLength: 50) }
        }
    }
}
