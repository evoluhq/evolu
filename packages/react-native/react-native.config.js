// What React Native's autolinking, Expo's and React Native CLI's, reads for
// Android: the C++ TurboModule's CMake target, its CMakeLists.txt, relative to
// android/, and the header autolinking.cpp includes. iOS finds the podspec at
// the package's root. ESM, since the package is "type": "module".
const config = {
  dependency: {
    platforms: {
      android: {
        cxxModuleCMakeListsModuleName: "evolu_sqlite",
        cxxModuleCMakeListsPath: "../cpp/CMakeLists.txt",
        cxxModuleHeaderName: "EvoluSqlite",
      },
    },
  },
};

export default config;
// React Native CLI's synchronous loadConfig requires the file, which for an ES
// module returns this export, or else the namespace, whose fields it reads as
// missing.
export { config as "module.exports" };
