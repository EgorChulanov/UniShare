import CoreMotion
import Foundation

// Runs globally from TabBarView; opens AirShare sheet on shake from anywhere.
final class ShakeDetectionService {
    static let shared = ShakeDetectionService()
    private let motion = CMMotionManager()
    private var lastShake = Date.distantPast

    private init() {}

    func start() {
        guard motion.isAccelerometerAvailable, !motion.isAccelerometerActive else { return }
        motion.accelerometerUpdateInterval = 0.1
        motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let self, let data else { return }
            let g = sqrt(pow(data.acceleration.x, 2) +
                         pow(data.acceleration.y, 2) +
                         pow(data.acceleration.z, 2))
            guard g > AppConstants.AirShare.shakeThreshold,
                  Date().timeIntervalSince(self.lastShake) > 1.5 else { return }
            self.lastShake = Date()
            DispatchQueue.main.async {
                guard !TabBarState.shared.showAirShare else { return }
                TabBarState.shared.showAirShare = true
                HapticsManager.shared.impact(.heavy)
            }
        }
    }

    func stop() {
        motion.stopAccelerometerUpdates()
    }
}
