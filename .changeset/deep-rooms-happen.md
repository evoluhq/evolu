---
"@evolu/nodejs": patch
---

Fixed TestOverviewReporter hiding failed test files and their output

The reporter dropped what test files wrote to standard output and standard
error, so a file that failed to load, for example on a top-level assertion,
was reported only as `test failed`, without its error. The reporter now prints
the output of each failed test file under "Output of failed test files:",
after the failed tests. Output of other files is still omitted.

The "Test files:" list now marks a file as failed whenever the file or any of
its tests fails. Before, it marked a file that exited with a nonzero code after
its tests passed with ✔, and left out a file that reported no tests, such as
one that failed to load, defined no tests, or exited during its tests. Such a
file is now listed as `(no tests reported)`, with ✔ when it exits with code 0,
which Node.js counts as passed even when the file exits before its tests run.
