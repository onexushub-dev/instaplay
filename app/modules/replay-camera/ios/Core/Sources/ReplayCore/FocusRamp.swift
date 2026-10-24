import Foundation

/// From `from` at `fromSec` to `to` at `toSec`, in the export's (composition) time.
public struct FocusSegment: Equatable {
  public var fromSec: Double, toSec: Double
  public var from: FocusRect, to: FocusRect
}

public enum FocusRamp {
  /// The framing at a source time: linear between the two nearest keyframes, held outside them.
  public static func rect(at tMs: Double, rects: [FocusRect], startMs: Double, stepMs: Double) -> FocusRect {
    let pos = (tMs - startMs) / stepMs
    if pos <= 0 { return rects[0] }
    if pos >= Double(rects.count - 1) { return rects[rects.count - 1] }
    let i = Int(pos.rounded(.down)), f = pos - Double(i)
    let a = rects[i], b = rects[i + 1]
    func mix(_ u: Double, _ v: Double) -> Double { u + (v - u) * f }
    return FocusRect(x: mix(a.x, b.x), y: mix(a.y, b.y), width: mix(a.width, b.width), height: mix(a.height, b.height))
  }

  /// Linear segments covering the cut, one per keyframe step, in composition time: `(t − cutStartMs) / speed`.
  public static func segments(rects: [FocusRect], startMs: Double, stepMs: Double, cutStartMs: Double,
                              cutEndMs: Double, speed: Double) -> [FocusSegment] {
    guard !rects.isEmpty, cutEndMs > cutStartMs, stepMs > 0, speed > 0 else { return [] }
    var times = [cutStartMs]
    for i in rects.indices {
      let t = startMs + Double(i) * stepMs
      if t > cutStartMs && t < cutEndMs { times.append(t) }
    }
    times.append(cutEndMs)
    func sec(_ t: Double) -> Double { (t - cutStartMs) / speed / 1000 }
    return zip(times, times.dropFirst()).map { a, b in
      FocusSegment(fromSec: sec(a), toSec: sec(b),
                   from: rect(at: a, rects: rects, startMs: startMs, stepMs: stepMs),
                   to: rect(at: b, rects: rects, startMs: startMs, stepMs: stepMs))
    }
  }
}
