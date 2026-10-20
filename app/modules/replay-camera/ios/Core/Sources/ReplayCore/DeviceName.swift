import Foundation

/// The name a phone shows to the other one while pairing ("iPhone XR#1234"): the model people know it by, plus a few
/// characters of its id so two phones of the same model never look alike. The person can replace it with their own.
public enum DeviceName {
  /// Model identifier the system reports ("iPhone11,8") → the name on the box. Anything not listed falls back to
  /// plain "iPhone"/"iPad" rather than a wrong guess.
  private static let marketing: [String: String] = [
    "iPhone8,1": "iPhone 6s", "iPhone8,2": "iPhone 6s Plus", "iPhone8,4": "iPhone SE",
    "iPhone9,1": "iPhone 7", "iPhone9,3": "iPhone 7", "iPhone9,2": "iPhone 7 Plus", "iPhone9,4": "iPhone 7 Plus",
    "iPhone10,1": "iPhone 8", "iPhone10,4": "iPhone 8", "iPhone10,2": "iPhone 8 Plus", "iPhone10,5": "iPhone 8 Plus",
    "iPhone10,3": "iPhone X", "iPhone10,6": "iPhone X",
    "iPhone11,2": "iPhone XS", "iPhone11,4": "iPhone XS Max", "iPhone11,6": "iPhone XS Max", "iPhone11,8": "iPhone XR",
    "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro", "iPhone12,5": "iPhone 11 Pro Max",
    "iPhone12,8": "iPhone SE 2", "iPhone14,6": "iPhone SE 3",
    "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12", "iPhone13,3": "iPhone 12 Pro",
    "iPhone13,4": "iPhone 12 Pro Max",
    "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13", "iPhone14,2": "iPhone 13 Pro",
    "iPhone14,3": "iPhone 13 Pro Max",
    "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus", "iPhone15,2": "iPhone 14 Pro",
    "iPhone15,3": "iPhone 14 Pro Max",
    "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus", "iPhone16,1": "iPhone 15 Pro",
    "iPhone16,2": "iPhone 15 Pro Max",
    "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,1": "iPhone 16 Pro",
    "iPhone17,2": "iPhone 16 Pro Max", "iPhone17,5": "iPhone 16e",
  ]

  /// Longest name that is kept, so a long one cannot break the pairing screens.
  public static let maxLength = 30
  /// What iOS 16+ reports as the device name to apps without the special entitlement.
  private static let generic: Set<String> = ["iPhone", "iPad"]

  /// "iPhone XR" for "iPhone11,8"; "iPhone"/"iPad" when the model is not known.
  public static func model(identifier: String) -> String {
    if let known = marketing[identifier] { return known }
    return identifier.hasPrefix("iPad") ? "iPad" : "iPhone"
  }

  /// The name to show: the one the person chose, else the system name when it is a real one, else "model#code".
  /// `code` is a few characters of the phone's id.
  public static func resolve(custom: String?, system: String, identifier: String, code: String) -> String {
    if let custom {
      let trimmed = String(custom.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLength))
      if !trimmed.isEmpty { return trimmed }
    }
    if !generic.contains(system) && !system.isEmpty { return system }
    return "\(model(identifier: identifier))#\(code)"
  }
}
