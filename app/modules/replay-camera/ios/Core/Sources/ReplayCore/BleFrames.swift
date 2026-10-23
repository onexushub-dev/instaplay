import Foundation

/// Splits a message into frames that fit one BLE write or notification, and puts them back together on the other side.
/// Frame: `[id hi][id lo][index][count][payload…]`. Messages are small (commands, state, pairing), so a message is capped
/// at `maxMessage` bytes and at 255 frames; anything bigger is refused rather than sent half-way.
public enum BleFrames {
  public static let headerSize = 4
  public static let maxMessage = 4096

  /// Empty when the message is empty, too big, or `maxFrame` leaves no room for payload.
  public static func split(_ message: Data, id: UInt16, maxFrame: Int) -> [Data] {
    let room = maxFrame - headerSize
    guard !message.isEmpty, message.count <= maxMessage, room > 0 else { return [] }
    let bytes = [UInt8](message)
    let count = (bytes.count + room - 1) / room
    guard count <= 255 else { return [] }
    var frames: [Data] = []
    for index in 0..<count {
      let start = index * room
      let end = min(start + room, bytes.count)
      var frame = Data([UInt8(id >> 8), UInt8(id & 0xFF), UInt8(index), UInt8(count)])
      frame.append(contentsOf: bytes[start..<end])
      frames.append(frame)
    }
    return frames
  }

  /// Collects frames per message id. A message whose frames do not all arrive within `timeout` seconds is dropped.
  public struct Assembler {
    private struct Partial {
      var parts: [Int: [UInt8]]
      let count: Int
      let firstAt: Double
    }

    private let timeout: Double
    private var partials: [UInt16: Partial] = [:]

    public init(timeout: Double = 2) {
      self.timeout = timeout
    }

    /// `now` in seconds. Returns the whole message when this frame completes it.
    public mutating func add(_ frame: Data, now: Double) -> Data? {
      partials = partials.filter { now - $0.value.firstAt <= timeout }
      let bytes = [UInt8](frame)
      guard bytes.count > BleFrames.headerSize else { return nil }
      let id = UInt16(bytes[0]) << 8 | UInt16(bytes[1])
      let index = Int(bytes[2])
      let count = Int(bytes[3])
      guard count > 0, index < count else { return nil }
      let payload = Array(bytes[BleFrames.headerSize...])
      if count == 1 { return Data(payload) }

      var partial = partials[id] ?? Partial(parts: [:], count: count, firstAt: now)
      guard partial.count == count else {
        partials.removeValue(forKey: id)
        return nil
      }
      partial.parts[index] = payload
      let size = partial.parts.values.reduce(0) { $0 + $1.count }
      guard size <= BleFrames.maxMessage else {
        partials.removeValue(forKey: id)
        return nil
      }
      guard partial.parts.count == count else {
        partials[id] = partial
        return nil
      }
      partials.removeValue(forKey: id)
      var whole: [UInt8] = []
      for i in 0..<count {
        guard let part = partial.parts[i] else { return nil }
        whole.append(contentsOf: part)
      }
      return Data(whole)
    }
  }
}
