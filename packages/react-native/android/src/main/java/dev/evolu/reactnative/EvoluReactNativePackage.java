package dev.evolu.reactnative;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

/**
 * The package autolinking registers for EvoluApp. The C++ TurboModule
 * EvoluSqlite registers through react-native.config.js instead.
 */
public class EvoluReactNativePackage extends BaseReactPackage {
  @Override
  @Nullable
  public NativeModule getModule(@NonNull String name, @NonNull ReactApplicationContext context) {
    return EvoluAppModule.NAME.equals(name) ? new EvoluAppModule(context) : null;
  }

  @Override
  @NonNull
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> {
      Map<String, ReactModuleInfo> modules = new HashMap<>();
      modules.put(
          EvoluAppModule.NAME,
          new ReactModuleInfo(
              EvoluAppModule.NAME,
              EvoluAppModule.NAME,
              /* canOverrideExistingModule= */ false,
              /* needsEagerInit= */ false,
              /* isCxxModule= */ false,
              /* isTurboModule= */ true));
      return modules;
    };
  }
}
