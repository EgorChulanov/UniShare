import UIKit

final class GameIconCacheService {
    static let shared = GameIconCacheService()

    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 200
    }

    func image(for key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func store(_ image: UIImage, for key: String) {
        cache.setObject(image, forKey: key as NSString)
        Task { await PersistentMediaCache.shared.store(image, for: key) }
    }

    func loadImage(from urlString: String) async -> UIImage? {
        let key = urlString as NSString
        if let cached = cache.object(forKey: key) { return cached }
        if let image = await PersistentMediaCache.shared.load(from: urlString) {
            cache.setObject(image, forKey: key)
            return image
        }
        return nil
    }

    func clearCache() { cache.removeAllObjects() }
}
