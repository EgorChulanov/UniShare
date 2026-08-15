import Foundation
import CoreBluetooth

private let kServiceUUID    = CBUUID(string: "4B4D7F23-3D1B-4E9A-B5F8-2A6C8E0D4F31")
private let kProfileCharUUID = CBUUID(string: "4B4D7F23-3D1B-4E9A-B5F8-2A6C8E0D4F32")

final class AirShareManager: NSObject, ObservableObject {
    @Published var status: AirShareStatus = .idle
    @Published var discoveredProfiles: [ReceivedProfile] = []

    private var centralManager: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?
    private var profileChar: CBMutableCharacteristic?
    private var connectedPeripherals: [CBPeripheral] = []
    private var seenUIDs: Set<String> = []
    private var connectionTimeouts: [UUID: Task<Void, Never>] = [:]
    private var myUID: String?

    var myProfileData: Data?

    // MARK: - Start / Stop

    func start(with profile: UserProfile) {
        myUID = profile.uid
        myProfileData = try? JSONEncoder().encode(AirSharePayload(uid: profile.uid))
        status = .searching
        centralManager  = CBCentralManager(delegate: self, queue: .main)
        peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
    }

    func stop() {
        centralManager?.stopScan()
        peripheralManager?.stopAdvertising()
        peripheralManager?.removeAllServices()
        centralManager   = nil
        peripheralManager = nil
        status = .idle
        discoveredProfiles = []
        seenUIDs = []
        connectedPeripherals = []
        connectionTimeouts.values.forEach { $0.cancel() }
        connectionTimeouts = [:]
        myUID = nil
    }

    func verify(_ profile: ReceivedProfile, with authoritativeProfile: UserProfile) {
        guard profile.uid == authoritativeProfile.uid else { return }
        let verified = ReceivedProfile(
            uid: authoritativeProfile.uid,
            username: authoritativeProfile.username,
            avatarUrl: authoritativeProfile.avatarUrl,
            games: Array(authoritativeProfile.games.prefix(6)),
            platforms: authoritativeProfile.platforms.compactMap(Platform.init(rawValue:)),
            isVerified: true
        )
        if let index = discoveredProfiles.firstIndex(where: { $0.uid == profile.uid }) {
            discoveredProfiles[index] = verified
            status = .received(verified)
        }
    }

    func reject(uid: String) {
        discoveredProfiles.removeAll { $0.uid == uid }
        seenUIDs.remove(uid)
        if discoveredProfiles.isEmpty { status = .searching }
    }
}

// MARK: - Central (scanner → connector)

extension AirShareManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard central.state == .poweredOn else {
            switch central.state {
            case .poweredOff: status = .bluetoothOff
            case .unauthorized: status = .permissionDenied
            case .unsupported: status = .unsupported
            default: break
            }
            return
        }
        central.scanForPeripherals(
            withServices: [kServiceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any],
                        rssi RSSI: NSNumber) {
        guard !connectedPeripherals.contains(peripheral) else { return }
        connectedPeripherals.append(peripheral)
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
        status = .holding
        HapticsManager.shared.impact(.light)
        connectionTimeouts[peripheral.identifier]?.cancel()
        connectionTimeouts[peripheral.identifier] = Task { @MainActor [weak self, weak central, weak peripheral] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled, let central, let peripheral else { return }
            central.cancelPeripheralConnection(peripheral)
            self?.connectionTimeouts[peripheral.identifier] = nil
            if self?.discoveredProfiles.isEmpty == true { self?.status = .searching }
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectionTimeouts[peripheral.identifier]?.cancel()
        connectionTimeouts[peripheral.identifier] = nil
        peripheral.discoverServices([kServiceUUID])
    }

    func centralManager(_ central: CBCentralManager,
                        didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        connectedPeripherals.removeAll { $0 == peripheral }
        connectionTimeouts[peripheral.identifier]?.cancel()
        connectionTimeouts[peripheral.identifier] = nil
        if discoveredProfiles.isEmpty { status = .searching }
    }

    func centralManager(_ central: CBCentralManager,
                        didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectedPeripherals.removeAll { $0 == peripheral }
        connectionTimeouts[peripheral.identifier]?.cancel()
        connectionTimeouts[peripheral.identifier] = nil
    }
}

// MARK: - Peripheral delegate (reading remote profile)

extension AirShareManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil,
              let svc = peripheral.services?.first(where: { $0.uuid == kServiceUUID })
        else { return }
        peripheral.discoverCharacteristics([kProfileCharUUID], for: svc)
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil,
              let char = service.characteristics?.first(where: { $0.uuid == kProfileCharUUID })
        else { return }
        peripheral.readValue(for: char)
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil,
              let data = characteristic.value,
              let payload = try? JSONDecoder().decode(AirSharePayload.self, from: data),
              payload.version == AirSharePayload.currentVersion,
              payload.expiresAt > Date(),
              UUID(uuidString: payload.uid) != nil,
              payload.uid != myUID,
              !seenUIDs.contains(payload.uid)
        else { return }

        seenUIDs.insert(payload.uid)
        let profile = ReceivedProfile(
            uid: payload.uid,
            username: "airshare.verifying".localized,
            avatarUrl: nil,
            games: [],
            platforms: [],
            isVerified: false
        )
        DispatchQueue.main.async {
            self.discoveredProfiles.append(profile)
            self.status = .received(profile)
            HapticsManager.shared.notification(.success)
        }
    }
}

// MARK: - Peripheral Manager (advertising our profile)

extension AirShareManager: CBPeripheralManagerDelegate {
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        guard peripheral.state == .poweredOn else { return }
        let char = CBMutableCharacteristic(
            type: kProfileCharUUID,
            properties: [.read],
            value: nil,           // dynamic; served in didReceiveRead
            permissions: [.readable]
        )
        profileChar = char
        let svc = CBMutableService(type: kServiceUUID, primary: true)
        svc.characteristics = [char]
        peripheral.add(svc)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                           didAdd service: CBService, error: Error?) {
        guard error == nil else { return }
        peripheral.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [kServiceUUID],
            CBAdvertisementDataLocalNameKey: "UniShare"
        ])
    }

    // Offset-aware long-read so large profile JSON transfers cleanly
    func peripheralManager(_ peripheral: CBPeripheralManager,
                           didReceiveRead request: CBATTRequest) {
        guard request.characteristic.uuid == kProfileCharUUID,
              let data = myProfileData
        else { peripheral.respond(to: request, withResult: .attributeNotFound); return }

        guard request.offset <= data.count else {
            peripheral.respond(to: request, withResult: .invalidOffset)
            return
        }
        request.value = data.subdata(in: request.offset ..< data.count)
        peripheral.respond(to: request, withResult: .success)
    }
}

// MARK: - Supporting Types

enum AirShareStatus {
    case idle, searching, holding, sent
    case received(ReceivedProfile)
    case bluetoothOff, permissionDenied, unsupported

    var description: String {
        switch self {
        case .idle, .searching: return "airshare.searching".localized
        case .holding:          return "airshare.hold".localized
        case .sent:             return "airshare.success".localized
        case .received:         return "airshare.found".localized
        case .bluetoothOff:     return "airshare.bluetooth.off".localized
        case .permissionDenied: return "airshare.bluetooth.denied".localized
        case .unsupported:      return "airshare.bluetooth.unsupported".localized
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
    let isVerified: Bool
}

private struct AirSharePayload: Codable {
    static let currentVersion = 1

    let version: Int
    let uid: String
    let expiresAt: Date

    init(uid: String) {
        version = Self.currentVersion
        self.uid = uid
        expiresAt = Date().addingTimeInterval(120)
    }
}
