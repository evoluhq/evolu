---
"@evolu/common": patch
---

Fixed schedules measuring elapsed time on the system clock

Schedules computed how much time had passed from `Time.now`, which is Unix
epoch time and follows system clock adjustments. A clock correction, such as an
NTP sync after a device wakes, therefore changed how a running schedule behaved:
a forward adjustment could reset a schedule that had just stepped, end a
time-boxed one early, or collapse a compensated delay to zero, and a backward
adjustment could keep a schedule running long past its limit.

Elapsed time now comes from `Time.performance`, which measures elapsed time and
is unaffected by clock adjustments. This applies to `elapsed`, `during`,
`fixed`, `windowed`, `maxElapsed`, `compensate`, and `resetScheduleAfter`.
Delays and outputs are unchanged; only the clock they are measured against is.

The monotonic clock has its own limit: on platforms where it stops while the
device sleeps, a suspended interval measures as little or no elapsed time, so
`during` and `maxElapsed` outlive the wall-clock deadline they were given and
`resetScheduleAfter` does not treat the sleep as inactivity.
