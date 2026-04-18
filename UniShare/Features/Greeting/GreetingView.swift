import SwiftUI

struct GreetingView: View {
    var onFinish: () -> Void

    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var theme: ThemeManager

    @State private var showAvatar = false
    @State private var showName = false
    @State private var glowExpanded = false
    @State private var screenOpacity = 1.0

    @State private var username = ""
    @State private var avatarUrl: String?

    var body: some View {
        ZStack {
            theme.effectiveBackground.ignoresSafeArea()
            GrainOverlay(opacity: 0.05)
            AnimatedFullScreenGlow(isExpanded: glowExpanded)

            VStack(spacing: 20) {
                AvatarView(url: avatarUrl, size: 100, showBorder: true)
                    .opacity(showAvatar ? 1 : 0)
                    .scaleEffect(showAvatar ? 1 : 0.5)
                    .animation(.spring(response: 0.6, dampingFraction: 0.7), value: showAvatar)

                VStack(spacing: 6) {
                    Text("greeting.welcome".localized)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(theme.effectiveSecondaryTextColor)

                    Text(username)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(theme.effectiveTextColor)
                }
                .opacity(showName ? 1 : 0)
                .offset(y: showName ? 0 : 20)
                .animation(.easeOut(duration: 0.5).delay(0.3), value: showName)
            }
        }
        .opacity(screenOpacity)
        .task {
            await loadUserData()
            runAnimation()
        }
    }

    private func loadUserData() async {
        guard let uid = env.auth.uid else { return }
        if let profile = try? await env.firestore.getUser(uid: uid) {
            await MainActor.run {
                username = profile.username
                avatarUrl = profile.avatarUrl
            }
        }
    }

    private func runAnimation() {
        HapticsManager.shared.playGreeting()

        withAnimation { showAvatar = true }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            showName = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            withAnimation(.easeInOut(duration: 1.0)) {
                glowExpanded = true
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            withAnimation(.easeInOut(duration: 0.5)) {
                screenOpacity = 0
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.7) {
            onFinish()
        }
    }
}
