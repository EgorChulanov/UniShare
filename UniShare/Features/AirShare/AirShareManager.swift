import Foundation
import MultipeerConnectivity
import CoreMotion
import Combine

final class AirShareManager: NSObject, ObservableObject {
    @Published var status: AirShareStatus = .idle
    @Published var discoveredProfiles: [ReceivedProfile] = []
    @Published var didMatch: ReceivedProfile?

    private var myPeerID: MCPeerID
    private var session: MCSession
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private let motionManager = CMMotionManager()

    private let serviceType = AppConstants.AirShare.serviceType

    var myProfileData: [String: Any]?

    override init() {
        let name = UIDevice.current.name
        myPeerID = MCPeerID(displayName: name)
        session = MCSession(peer: myPeerID, securityIdentity: nil, encryptionPreference: .required)
        super.init()
        session.delegate = self
    }

    // MARK: - Start / Stop

    func start(with profile: UserProfile) {
        myProfileData = profile.firestoreData
        status = .searching

        advertiser = MCNearbyServiceAdvertiser(peer: myPeerID, discoveryInfo: nil, serviceType: serviceType)
        advertiser?.delegate = self
        advertiser?.startAdvertisingPeer()

        browser = MCNearbyServiceBrowser(peer: myPeerID, serviceType: serviceType)
        browser?.delegate = self
        browser?.startBrowsingForPeers()

        startShakeDetection()
    }

    func stop() {
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()
        session.disconnect()
        motionManager.stopAccelerometerUpdates()
        status = .idle
        discoveredProfiles = []
    }

    // MARK: - Shake Detection

    private func startShakeDetection() {
        guard motionManager.isAccelerometerAvailable else { return }
        motionManager.accelerometerUpdateInterval = 0.1
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let data else { return }
            let magnitude = sqrt(
                pow(data.acceleration.x, 2) +
                pow(data.acceleration.y, 2) +
                pow(data.acceleration.z, 2)
            )
            if magnitude > AppConstants.AirShare.shakeThreshold {
                self?.handleShake()
            }
        }
    }

    private var lastShakeTime = Date.distantPast

    private func handleShake() {
        guard Date().timeIntervalSince(lastShakeTime) > 1.0 else { return }
        lastShakeTime = Date()

        guard !session.connectedPeers.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: myProfileData ?? [:]) else { return }

        do {
            try session.send(data, toPeers: session.connectedPeers, with: .reliable)
            DispatchQueue.main.async { self.status = .sent }
            HapticsManager.shared.impact(.heavy)
        } catch {
            print("AirShare send error: \(error)")
        }
    }

    private func handleReceivedData(_ data: Data, from peerID: MCPeerID) {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let uid = json["uid"] as? String,
              let username = json["username"] as? String else { return }

        let profile = ReceivedProfile(
            uid: uid,
            username: username,
            avatarUrl: json["avatarUrl"] as? String,
            games: json["games"] as? [String] ?? [],
            platforms: (json["platforms"] as? [String] ?? []).compactMap { Platform(rawValue: $0) }
        )

        DispatchQueue.main.async {
            self.discoveredProfiles.append(profile)
            self.status = .received(profile)
            HapticsManager.shared.notification(.success)
        }
    }
}

// MARK: - MCSession Delegate

extension AirShareManager: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async {
            switch state {
            case .connected:
                self.status = .holding
            case .connecting:
                self.status = .searching
            case .notConnected:
                if case .idle = self.status {} else { self.status = .searching }
            @unknown default:
                break
            }
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        handleReceivedData(data, from: peerID)
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

// MARK: - MCNearbyServiceAdvertiser Delegate

extension AirShareManager: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        invitationHandler(true, session)
    }
}

// MARK: - MCNearbyServiceBrowser Delegate

extension AirShareManager: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        browser.invitePeer(peerID, to: session, withContext: nil, timeout: 10)
        DispatchQueue.main.async { self.status = .holding }
    }

    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        if session.connectedPeers.isEmpty {
            DispatchQueue.main.async { self.status = .searching }
        }
    }
}

// MARK: - Supporting Types

enum AirShareStatus {
    case idle
    case searching
    case holding
    case sent
    case received(ReceivedProfile)

    var description: String {
        switch self {
        case .idle: return "airshare.searching".localized
        case .searching: return "airshare.searching".localized
        case .holding: return "airshare.hold".localized
        case .sent: return "airshare.success".localized
        case .received: return "airshare.found".localized
        }
    }
}

struct ReceivedProfile: Identifiable {
    var id: String { uid }
    let uid: String
    let username: String
    let avatarUrl: String?
    let games: [String]
    let platforms: [Platform]
}
