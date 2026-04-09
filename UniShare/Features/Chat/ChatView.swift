import SwiftUI
import PhotosUI

struct ChatView: View {
    let chat: Chat

    @EnvironmentObject var theme: ThemeManager
    @StateObject private var vm: ChatViewModel
    @State private var photoItem: PhotosPickerItem?
    @State private var showReportAlert = false

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
                // Messages
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

                // Input bar
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
                        showReportAlert = true
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
        .alert("Report User", isPresented: $showReportAlert) {
            Button("cancel".localized, role: .cancel) {}
            Button("Report", role: .destructive) {}
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
                        .fill(vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                              ? theme.effectiveCardColor
                              : LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary],
                                               startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 38, height: 38)
                    if vm.isSending {
                        ProgressView().scaleEffect(0.7).tint(.white)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                             ? theme.effectiveSecondaryTextColor : .white)
                    }
                }
            }
            .disabled(vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSending)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            theme.effectiveBackground
                .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: -3)
        )
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
                            isFromMe ?
                            LinearGradient(colors: [theme.effectivePrimary, theme.effectiveTertiary], startPoint: .topLeading, endPoint: .bottomTrailing) :
                            LinearGradient(colors: [theme.effectiveCardColor, theme.effectiveCardColor], startPoint: .leading, endPoint: .trailing)
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
