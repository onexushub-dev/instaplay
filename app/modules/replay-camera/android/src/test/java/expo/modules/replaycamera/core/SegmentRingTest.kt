package expo.modules.replaycamera.core

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeFileOps : FileOps {
  val deleted = mutableListOf<File>()
  val created = mutableListOf<File>()
  var listing = listOf<File>()

  override fun delete(file: File) { deleted.add(file) }
  override fun list(dir: File): List<File> = listing
  override fun exists(file: File): Boolean = file !in deleted
}

private fun file(i: Int) = File("/tmp/replay-buffer/$i.mp4")
private fun seg(i: Int) = Segment(file(i), startTime = 2.0 * i, duration = 2.0)
private val dest = File("/tmp/clips/clip.mp4")

class SegmentRingTest {
  @Test fun test_appendBeyondCapacityEvictsAndDeletesOldest() {
    val ops = FakeFileOps()
    val ring = SegmentRing(30, ops)
    for (i in 0 until 31) ring.append(seg(i))
    assertEquals(30, ring.snapshot(600.0).size)
    assertEquals(listOf(file(0)), ops.deleted)
  }

  @Test fun test_snapshotReturnsLast60s() {
    val ring = SegmentRing(30, FakeFileOps())
    for (i in 0 until 30) ring.append(seg(i))
    assertEquals(0.0, ring.snapshot(60.0).first().startTime, 0.0)
    assertEquals(5, ring.snapshot(10.0).size)
  }

  @Test fun test_snapshotWithFewSegments() {
    val ring = SegmentRing(30, FakeFileOps())
    for (i in 0 until 3) ring.append(seg(i))
    assertEquals(6.0, ring.copyClip(60.0, dest) { _, _ -> }, 0.001)
  }

  @Test fun test_savedClipSurvivesEviction() {
    val ops = FakeFileOps()
    val ring = SegmentRing(30, ops)
    for (i in 0 until 30) ring.append(seg(i))
    ring.copyClip(60.0, dest) { _, d -> ops.created.add(d) }
    for (i in 30 until 60) ring.append(seg(i))
    assertEquals(listOf(dest), ops.created)
    assertFalse(dest in ops.deleted)
    assertEquals(30, ops.deleted.size)
  }

  @Test fun test_copyClipPassesSegmentsOldestFirst() {
    val ring = SegmentRing(30, FakeFileOps())
    for (i in 0 until 4) ring.append(seg(i))
    var passed = listOf<File>()
    ring.copyClip(60.0, dest) { s, _ -> passed = s.map { it.file } }
    assertEquals(listOf(file(0), file(1), file(2), file(3)), passed)
  }

  @Test fun test_clearDeletesAll() {
    val ops = FakeFileOps()
    val ring = SegmentRing(30, ops)
    for (i in 0 until 5) ring.append(seg(i))
    ring.clear()
    assertEquals(5, ops.deleted.size)
    assertTrue(ring.snapshot(60.0).isEmpty())
  }

  @Test fun test_purgeOrphansRemovesLeftoverFiles() {
    val ops = FakeFileOps()
    ops.listing = listOf(file(7), file(8), file(9))
    SegmentRing.purgeOrphans(File("/tmp/replay-buffer"), ops)
    assertEquals(listOf(file(7), file(8), file(9)), ops.deleted)
  }
}
