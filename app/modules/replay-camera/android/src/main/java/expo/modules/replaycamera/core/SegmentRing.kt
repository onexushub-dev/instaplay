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
 * so disk usage stays bounded by [capacity] segments — except segments a copy is reading,
 * whose deletion waits until that copy ends.
 */
class SegmentRing(private val capacity: Int = 30, private val fileOps: FileOps) {
  private val segments = ArrayDeque<Segment>()
  private val pins = mutableMapOf<File, Int>()
  private val doomed = mutableSetOf<File>()

  @Synchronized fun append(segment: Segment) {
    segments.addLast(segment)
    while (segments.size > capacity) discard(segments.removeFirst().file)
  }

  /** Segments overlapping `[newestEnd - lastSeconds, newestEnd]`, oldest first. */
  @Synchronized fun snapshot(lastSeconds: Double = 60.0): List<Segment> = window(lastSeconds)

  /**
   * Copies the window into [dest] through [concat] and returns its duration in seconds.
   * [concat] runs outside the ring's lock, so capture keeps appending meanwhile; the window's
   * files are pinned and survive eviction or [clear] until the copy ends.
   */
  fun copyClip(lastSeconds: Double, dest: File, concat: (List<Segment>, File) -> Unit): Double {
    val picked = synchronized(this) {
      window(lastSeconds).also { w -> w.forEach { pins[it.file] = (pins[it.file] ?: 0) + 1 } }
    }
    try {
      concat(picked, dest)
    } finally {
      synchronized(this) { picked.forEach { unpin(it.file) } }
    }
    return picked.sumOf { it.duration }
  }

  @Synchronized fun clear() {
    segments.forEach { discard(it.file) }
    segments.clear()
  }

  private fun discard(file: File) {
    if (file in pins) doomed += file else fileOps.delete(file)
  }

  private fun unpin(file: File) {
    val left = (pins[file] ?: 1) - 1
    if (left > 0) pins[file] = left else pins.remove(file)
    if (left <= 0 && doomed.remove(file)) fileOps.delete(file)
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
