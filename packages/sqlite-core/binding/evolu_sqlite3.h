/*
 * The sqlite3.h that evolu_database.h includes, under a name no other library
 * has. Where native/include holds the headers, as React Native's vendor script
 * writes them, a bare "sqlite3.h" isn't next to evolu_database.h, so Xcode's
 * header map could answer it with another pod's; the vendor script writes its
 * own include/evolu_sqlite3.h, which includes ../c/sqlite3.h. sqlite-core's
 * host builds find SQLite's through their include path.
 */
#ifndef EVOLU_SQLITE3_H
#define EVOLU_SQLITE3_H

#include "sqlite3.h"

#endif
