# Builds Evolu's native code for Android into the app's libappmodules.so,
# which React Native's autolinking adds through react-native.config.js: the C
# of native/units, the wrapper units that rename SQLite, the core, BearSSL and
# Monocypher to evolu_ names before they compile native/c, and the C++
# TurboModule and JSI adapter. The flags come from native.json, as the vendor
# step recorded them, and native/ must be the tree it wrote from it.
#
# The app's own target compiles the generated autolinking.cpp, which includes
# EvoluSqlite.h, under -Wall -Werror, so every option and define here is
# PRIVATE and only this directory is a PUBLIC include directory. The app links
# evolu_sqlite, then links common_flags into it, both with the plain signature,
# which CMake refuses to mix with a keyword one on a target, so every
# target_link_libraries call on evolu_sqlite is plain too.
cmake_minimum_required(VERSION 3.19)
project(evolu_sqlite C CXX)

get_filename_component(EVOLU_PACKAGE ${CMAKE_CURRENT_LIST_DIR}/.. ABSOLUTE)
file(READ ${EVOLU_PACKAGE}/native.json EVOLU_MANIFEST)
file(SHA256 ${EVOLU_PACKAGE}/native.json EVOLU_MANIFEST_SHA256)
# So a build after a pull configures again and checks the new native.json.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
  ${EVOLU_PACKAGE}/native.json ${EVOLU_PACKAGE}/native/native.json.sha256)
set(EVOLU_DIGEST "")
if(EXISTS ${EVOLU_PACKAGE}/native/native.json.sha256)
  file(READ ${EVOLU_PACKAGE}/native/native.json.sha256 EVOLU_DIGEST)
endif()
if(NOT "${EVOLU_DIGEST}" STREQUAL "${EVOLU_MANIFEST_SHA256}\n")
  message(FATAL_ERROR
    "@evolu/react-native's native/ is missing or wasn't written from its "
    "native.json. In Evolu's repository, run node "
    "packages/react-native/scripts/vendor-native.mts.")
endif()

# Reads the array of native.json at the JSON path into a list.
function(evolu_manifest_list output)
  string(JSON length LENGTH "${EVOLU_MANIFEST}" ${ARGN})
  set(items "")
  if(length GREATER 0)
    math(EXPR last "${length} - 1")
    foreach(index RANGE ${last})
      string(JSON item GET "${EVOLU_MANIFEST}" ${ARGN} ${index})
      list(APPEND items "${item}")
    endforeach()
  endif()
  set(${output} "${items}" PARENT_SCOPE)
endfunction()
evolu_manifest_list(EVOLU_DEFINES flags defines)
evolu_manifest_list(EVOLU_C_FLAGS flags c)
evolu_manifest_list(EVOLU_ANDROID_C_FLAGS flags android c)
string(JSON EVOLU_HEADER_SEARCH_PATH GET "${EVOLU_MANIFEST}"
  flags headerSearchPath)
set(EVOLU_INCLUDE ${EVOLU_PACKAGE}/${EVOLU_HEADER_SEARCH_PATH})

# The C, optimized in Debug builds too, since the template's -O0 makes SQLite
# and BearSSL several times slower. The app's CMake turns on LTO when its check
# passes, or passes -flto in its C flags, and the constant-time code shouldn't
# be inlined across files.
file(GLOB EVOLU_UNITS CONFIGURE_DEPENDS ${EVOLU_PACKAGE}/native/units/*.c)
add_library(evolu_sqlite_c STATIC ${EVOLU_UNITS})
target_include_directories(evolu_sqlite_c PRIVATE ${EVOLU_INCLUDE})
target_compile_definitions(evolu_sqlite_c PRIVATE ${EVOLU_DEFINES})
target_compile_options(evolu_sqlite_c PRIVATE
  ${EVOLU_C_FLAGS} ${EVOLU_ANDROID_C_FLAGS} -fno-lto)
set_target_properties(evolu_sqlite_c PROPERTIES
  INTERPROCEDURAL_OPTIMIZATION OFF)

# The TurboModule and the JSI adapter. Hidden symbols keep the adapter's C++
# inside libappmodules.so, whose autolinking.cpp creates the module.
add_library(evolu_sqlite STATIC
  ${CMAKE_CURRENT_LIST_DIR}/EvoluSqlite.cpp
  ${CMAKE_CURRENT_LIST_DIR}/EvoluSqliteBinding.cpp)
target_include_directories(evolu_sqlite PUBLIC ${CMAKE_CURRENT_LIST_DIR})
target_include_directories(evolu_sqlite PRIVATE ${EVOLU_INCLUDE})
target_compile_definitions(evolu_sqlite PRIVATE ${EVOLU_DEFINES} RN_STRICT_API)
target_compile_options(evolu_sqlite PRIVATE
  -std=c++20 -fexceptions -frtti -fvisibility=hidden)
target_link_libraries(evolu_sqlite
  evolu_sqlite_c jsi reactnative react_codegen_EvoluReactNativeSpec)
