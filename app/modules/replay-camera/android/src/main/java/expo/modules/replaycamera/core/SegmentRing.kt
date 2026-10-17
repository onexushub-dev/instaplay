package expo.modules.replaycamera.core

import java.io.File

/** [startTime] is seconds since the session started. */
data class Segment(val file: File, val startTime: Double, val duration: Double) {
  val end: Double get() = startTime + duration
}

interface FileOps {
  fun delete(file: File)
  fun list(dir: File): List<File>
  fun exists(file: File): Boolean
}

/**
 * Rolling window of encoded segments. Evicted segments are deleted immediately,
 * so disk usage stays bounded by [capacity] segments.
 */
class SegmentRing(private val capacity: Int = 30, private val fileOps: FileOps) {
  private val segments = ArrayDeque<Segment>()

  @Synchronized fun append(segment: Segment) {
    segments.addLast(segment)
    while (segments.size > capacity) fileOps.delete(segments.removeFirst().file)
  }

  /** Segments overlapping `[newestEnd - lastSeconds, newestEnd]`, oldest first. */
  @Synchronized fun snapshot(lastSeconds: Double = 60.0): List<Segment> = window(lastSeconds)

  /**
   * Copies the window into [dest] through [concat] and returns its duration in seconds.
   * Holds the ring's lock so no segment of the window is evicted mid-copy.
   */
  @Synchronized fun copyClip(lastSeconds: Double, dest: File, concat: (List<Segment>, File) -> Unit): Double {
    val picked = window(lastSeconds)
    concat(picked, dest)
    return picked.sumOf { it.duration }
  }

  @Synchronized fun clear() {
    segments.forEach { fileOps.delete(it.file) }
    segments.clear()
  }

  private fun window(lastSeconds: Double): List<Segment> {
    val newestEnd = segments.lastOrNull()?.end ?: return emptyList()
    val from = newestEnd - lastSeconds
    return segments.filter { it.end > from }
  }

  companion object {
    fun purgeOrphans(dir: File, fileOps: FileOps) {
      fileOps.list(dir).forEach { fileOps.delete(it) }
    }
  }
}
