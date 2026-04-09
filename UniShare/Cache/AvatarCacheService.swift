import UIKit
import Combine

final class AvatarCacheService: ObservableObject {
    static let shared = AvatarCacheService()

    private let cache = NSCache<NSString, UIImage>()
    @Published var cachedAvatar: UIImage?

    private init() {
        cache.countLimit = 100
    }

    func image(for url: String) -> UIImage? {
        cache.object(forKey: url as NSString)
    }

    func store(_ image: UIImage, for url: String) {
        cache.setObject(image, forKey: url as NSString)
    }

    func loadImage(from urlString: String) async -> UIImage? {
        if let cached = cache.object(forKey: urlString as NSString) {
            return cached
        }
        guard let url = URL(string: urlString) else { return nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let image = UIImage(data: data) else { return nil }
            cache.setObject(image, forKey: urlString as NSString)
            return image
        } catch {
            return nil
        }
    }

    func loadUserAvatar(from urlString: String?) async {
        guard let urlString, !urlString.isEmpty else { return }
        if let image = await loadImage(from: urlString) {
            await MainActor.run { cachedAvatar = image }
        }
    }
}
