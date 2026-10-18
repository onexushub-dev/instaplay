import UIKit

/// Opens Instagram's Story composer with a video as the background (Meta "Sharing to Stories").
/// Needs a Meta (Facebook) App ID; without one, or without Instagram installed, the caller falls back.
enum InstagramStory {
  @MainActor
  static func share(videoPath: String, metaAppId: String) -> Bool {
    guard !metaAppId.isEmpty,
          let url = URL(string: "instagram-stories://share?source_application=\(metaAppId)"),
          UIApplication.shared.canOpenURL(url),
          let video = FileManager.default.contents(atPath: videoPath)
    else { return false }
    UIPasteboard.general.setItems(
      [["com.instagram.sharedSticker.backgroundVideo": video]],
      options: [.expirationDate: Date().addingTimeInterval(5 * 60)]
    )
    UIApplication.shared.open(url)
    return true
  }
}
