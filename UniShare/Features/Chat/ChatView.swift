import SwiftUI
import PhotosUI

struct ChatView: View {
    let chat: Chat

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm: ChatViewModel
    @State private var photoItem: PhotosPickerItem?
    @State private var showReportSheet = false
    @State private var showRatingSheet = false
    @State private var hasRated = false
    @State private var showBlockConfirmation = false
    @State private var showPartnerProfile = false
    @State private var showDeleteConfirmation = false

    init(chat: Chat) {
        self.chat = chat
        let env = AppEnvironment.shared
        _vm = StateObject(wrappedValue: ChatViewModel(
            chat: chat,
            auth: env.auth,
            db: env.db,
            storage: env.storage
        ))
    }

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            SafetyNotice()
                                .padding(.bottom, 4)

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

                if !hasRated && !vm.messages.isEmpty {
                    confirmBanner
                }

                inputBar
            }
        }
        .navigationTitle(vm.partnerProfile?.username ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button { showPartnerProfile = vm.partnerProfile != nil } label: {
                    HStack(spacing: 8) {
                        AvatarView(url: vm.partnerProfile?.avatarUrl, size: 32)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(vm.partnerProfile?.username ?? "")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(theme.effectiveTextColor)
                            Text(vm.isPartnerOnline ? "chat.online".localized : "chat.offline".localized)
                                .font(.system(size: 11))
                                .foregroundColor(vm.isPartnerOnline ? .green : theme.effectiveSecondaryTextColor)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button(role: .destructive) {
                        showReportSheet = true
                    } label: {
                        Label("chat.report".localized, systemImage: "flag")
                    }
                    Button(role: .destructive) {
                        showBlockConfirmation = true
                    } label: {
                        Label("chat.block".localized, systemImage: "person.fill.xmark")
                    }
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("chat.delete".localized, systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundColor(theme.effectivePrimary)
                }
            }
        }
        .task {
            await vm.start()
            if let partnerUid = vm.partnerUid, !vm.myUid.isEmpty {
                hasRated = (try? await AppEnvironment.shared.db.hasReviewed(
                    fromUid: vm.myUid, toUid: partnerUid, chatId: chat.id)) ?? false
            }
        }
        .sheet(isPresented: $showReportSheet) {
            ReportSheet(
                username: vm.partnerProfile?.username ?? "",
                onSubmit: { reason, details in
                    guard let partnerUid = vm.partnerUid else { return }
                    try await AppEnvironment.shared.db.submitReport(
                        reporterId: vm.myUid,
                        subjectId: partnerUid,
                        reason: reason,
                        details: details
                    )
                }
            )
                .environmentObject(theme)
        }
        .sheet(isPresented: $showRatingSheet) {
            RatingSheet(partnerUsername: vm.partnerProfile?.username ?? "") { rating, text in
                Task {
                    guard let partnerUid = vm.partnerUid else { return }
                    do {
                        try await AppEnvironment.shared.db.submitReview(
                            fromUid: vm.myUid, toUid: partnerUid,
                            chatId: chat.id, rating: rating, text: text)
                        hasRated = true
                    } catch {
                        vm.errorMessage = error.localizedDescription
                    }
                }
            }
            .environmentObject(theme)
        }
        .sheet(isPresented: $showPartnerProfile) {
            if let profile = vm.partnerProfile {
                ProfilePreviewSheet(profile: profile).environmentObject(theme)
            }
        }
        .alert("common.error".localized, isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("common.ok".localized, role: .cancel) {}
        } message: {
            Text(vm.errorMessage ?? "")
        }
        .confirmationDialog(
            "chat.block.confirmation".localized,
            isPresented: $showBlockConfirmation,
            titleVisibility: .visible
        ) {
            Button("chat.block".localized, role: .destructive) {
                Task {
                    guard let partnerUid = vm.partnerUid else { return }
                    do {
                        try await AppEnvironment.shared.db.blockUser(
                            blockerId: vm.myUid,
                            blockedId: partnerUid
                        )
                        dismiss()
                    } catch {
                        vm.errorMessage = error.localizedDescription
                    }
                }
            }
            Button("cancel".localized, role: .cancel) {}
        }
        .confirmationDialog(
            "chat.delete.confirm.title".localized,
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("chat.delete".localized, role: .destructive) {
                Task {
                    do {
                        try await vm.deleteChat()
                        dismiss()
                    } catch {
                        vm.errorMessage = error.localizedDescription
                    }
                }
            }
            Button("cancel".localized, role: .cancel) {}
        } message: {
            Text("chat.delete.confirm.message".localized)
        }
    }

    // MARK: - Confirm banner

    private var confirmBanner: some View {
        Button { showRatingSheet = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "star.bubble.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(theme.effectivePrimary, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("chat.review.title".localized)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.effectiveTextColor)
                    Text("chat.review.subtitle".localized)
                        .font(.system(size: 11))
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
            }
            .padding(12)
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: 18, style: .continuous), interactive: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            PhotosPicker(selection: $photoItem, matching: .images) {
                Image(systemName: "photo.on.rectangle.angled")
                    .foregroundStyle(theme.effectivePrimary)
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 42, height: 42)
                    .adaptiveGlass(in: Circle(), interactive: true)
            }
            .onChange(of: photoItem) { item in
                Task {
                    defer { photoItem = nil }
                    if let data = try? await item?.loadTransferable(type: Data.self),
                       let image = UIImage(data: data) {
                        await vm.sendImage(image)
                    }
                }
            }

            TextField("chat.placeholder".localized, text: $vm.inputText, axis: .vertical)
                .font(.system(size: 15))
                .foregroundColor(theme.effectiveTextColor)
                .accentColor(theme.effectivePrimary)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: 21, style: .continuous), interactive: true)
                .submitLabel(.send)
                .onSubmit { Task { await vm.sendText() } }
                .accessibilityIdentifier("chat.input")

            if hasMessageText || vm.isSending {
                Button {
                    Task { await vm.sendText() }
                } label: {
                    Group {
                        if vm.isSending {
                            ProgressView().controlSize(.small).tint(.white)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(width: 42, height: 42)
                    .background(theme.effectivePrimary, in: Circle())
                    .adaptiveGlass(in: Circle(), interactive: true)
                }
                .disabled(vm.isSending)
                .accessibilityIdentifier("chat.send")
                .transition(.scale(scale: 0.75).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .animation(.spring(response: 0.3, dampingFraction: 0.82), value: hasMessageText)
    }

    private var hasMessageText: Bool {
        !vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

private struct SafetyNotice: View {
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "lock.shield.fill")
                .foregroundStyle(theme.effectivePrimary)
            Text("chat.safety.notice".localized)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(theme.effectiveSecondaryTextColor)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(theme.effectivePrimary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Report Sheet

struct ReportSheet: View {
    let username: String
    let onSubmit: (String, String) async throws -> Void

    @EnvironmentObject var theme: ThemeManager
    @Environment(\.dismiss) private var dismiss

    private let reasons = [
        ("exclamationmark.bubble", "report.reason.spam"),
        ("hand.raised", "report.reason.content"),
        ("person.fill.xmark", "report.reason.harassment"),
        ("questionmark.circle", "report.reason.fake"),
        ("person.badge.minus", "report.reason.underage"),
        ("ellipsis.circle", "report.reason.other")
    ]

    @State private var selectedReason: String? = nil
    @State private var otherText = ""
    @State private var submitted = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

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
            .navigationTitle(String(format: "report.title".localized, username))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("cancel".localized) { dismiss() }
                        .foregroundColor(theme.effectiveSecondaryTextColor)
                }
                if !submitted {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("report.send".localized) {
                            submit()
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(selectedReason != nil ? theme.effectivePrimary : theme.effectiveSecondaryTextColor)
                        .disabled(selectedReason == nil || isSubmitting)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .alert("common.error".localized, isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("common.ok".localized, role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var reasonsList: some View {
        ScrollView {
            VStack(spacing: 0) {
                Text("report.question".localized)
                    .font(.system(size: 14))
                    .foregroundColor(theme.effectiveSecondaryTextColor)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.top, 16)
                    .padding(.bottom, 12)

                LazyVStack(spacing: 9) {
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

                                Text(reason.localized)
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
                                    ? theme.effectivePrimary.opacity(0.14)
                                    : theme.effectiveCardColor
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(
                                        selectedReason == reason
                                            ? theme.effectivePrimary.opacity(0.55)
                                            : theme.effectiveSecondaryTextColor.opacity(0.10),
                                        lineWidth: 1
                                    )
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)

                // Extra text field when "Other reason" is selected
                if selectedReason == "report.reason.other" {
                    TextField("report.details".localized, text: $otherText, axis: .vertical)
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
            Text("report.submitted".localized)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(theme.effectiveTextColor)
            Text("report.submitted.subtitle".localized)
                .font(.system(size: 14))
                .foregroundColor(theme.effectiveSecondaryTextColor)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("report.done".localized) { dismiss() }
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 32).padding(.vertical, 12)
                .background(theme.effectivePrimary)
                .clipShape(Capsule())
        }
    }

    private func submit() {
        guard let selectedReason else { return }
        isSubmitting = true
        Task {
            do {
                try await onSubmit(selectedReason, otherText.trimmingCharacters(in: .whitespacesAndNewlines))
                await MainActor.run {
                    submitted = true
                    isSubmitting = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isSubmitting = false
                }
            }
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
                    ChatMessageImage(url: imageUrl)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(.white.opacity(0.16), lineWidth: 1)
                        }
                        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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

private struct ChatMessageImage: View {
    let url: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 244, maxHeight: 360)
                    .background(Color.black.opacity(0.12))
            } else {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.gray.opacity(0.18))
                    .frame(width: 220, height: 164)
                    .overlay(ProgressView())
            }
        }
        .task(id: url) { image = await AvatarCacheService.shared.loadImage(from: url) }
    }
}
