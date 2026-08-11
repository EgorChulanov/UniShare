import Foundation
import UIKit
import UserNotifications
import Supabase

@MainActor
final class PushNotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushNotificationService()

    private let client = SupabaseManager.shared.client
    private let tokenDefaultsKey = "apns_device_token"
    private var isActivationInFlight = false

    private override init() {
        super.init()
    }

    func configure() {
        UNUserNotificationCenter.current().delegate = self
    }

    func activateForAuthenticatedUser() async {
        guard !AppConstants.isUITesting, client.auth.currentUser != nil, !isActivationInFlight else { return }
        isActivationInFlight = true
        defer { isActivationInFlight = false }

        do {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                _ = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            }
            let refreshedSettings = await center.notificationSettings()
            guard refreshedSettings.authorizationStatus == .authorized ||
                    refreshedSettings.authorizationStatus == .provisional else { return }
            UIApplication.shared.registerForRemoteNotifications()
            try await syncStoredToken()
        } catch {
            #if DEBUG
            print("Push activation failed: \(error.localizedDescription)")
            #endif
        }
    }

    func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: tokenDefaultsKey)
        Task { try? await syncStoredToken() }
    }

    func didFailToRegister(error: Error) {
        #if DEBUG
        print("APNs registration failed: \(error.localizedDescription)")
        #endif
    }

    func unregisterCurrentToken() async {
        guard let token = UserDefaults.standard.string(forKey: tokenDefaultsKey),
              client.auth.currentUser != nil else { return }
        _ = try? await client.rpc(
            "unregister_device_token",
            params: UnregisterTokenParams(deviceToken: token)
        ).execute()
        UserDefaults.standard.removeObject(forKey: tokenDefaultsKey)
    }

    private func syncStoredToken() async throws {
        guard let token = UserDefaults.standard.string(forKey: tokenDefaultsKey),
              client.auth.currentUser != nil else { return }
        try await client.rpc(
            "register_device_token",
            params: RegisterTokenParams(deviceToken: token, tokenEnvironment: environment)
        ).execute()
    }

    private var environment: String {
        #if DEBUG
        "sandbox"
        #else
        "production"
        #endif
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let payload = response.notification.request.content.userInfo
        guard let rawURL = payload["deep_link"] as? String,
              let url = URL(string: rawURL),
              url.scheme == AppConstants.DeepLink.scheme else { return }
        await MainActor.run { TabBarState.shared.handleDeepLink(url) }
    }
}

private struct RegisterTokenParams: Encodable {
    let deviceToken: String
    let tokenEnvironment: String

    enum CodingKeys: String, CodingKey {
        case deviceToken = "device_token"
        case tokenEnvironment = "token_environment"
    }
}

private struct UnregisterTokenParams: Encodable {
    let deviceToken: String

    enum CodingKeys: String, CodingKey {
        case deviceToken = "device_token"
    }
}
