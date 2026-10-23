package dev.evolu.reactnative;

import android.app.Activity;
import android.content.Context;
import androidx.annotation.NonNull;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactDelegate;
import com.facebook.react.ReactHost;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.UiThreadUtil;
import java.io.File;
import java.io.IOException;

/**
 * The TurboModule EvoluApp on Android: the directory of the database files and
 * React Native's own reload, so no app needs Expo for either. Java, so neither
 * AGP's built-in Kotlin nor R8 rules matter: React Native's consumer rule keeps
 * every NativeModule.
 */
public class EvoluAppModule extends NativeEvoluAppSpec {
  public static final String NAME = "EvoluApp";

  public EvoluAppModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }

  /** expo-sqlite's directory, so the databases it wrote open in place. */
  @Override
  public String getDatabaseDirectory() {
    try {
      return getReactApplicationContext().getFilesDir().getCanonicalPath()
          + File.separator
          + "SQLite";
    } catch (IOException e) {
      throw new RuntimeException(e);
    }
  }

  /**
   * Reloads through the application's ReactHost, which schedules its work and
   * returns at once, or, for a host without one, as Expo does, through the
   * current activity's ReactDelegate on the UI thread, which its Debug check
   * expects.
   */
  @Override
  public void reloadApp() {
    Context application = getReactApplicationContext().getApplicationContext();
    ReactHost host =
        application instanceof ReactApplication
            ? ((ReactApplication) application).getReactHost()
            : null;
    if (host != null) {
      host.reload("EvoluApp.reloadApp");
      return;
    }
    Activity activity = getReactApplicationContext().getCurrentActivity();
    ReactDelegate delegate =
        activity instanceof ReactActivity ? ((ReactActivity) activity).getReactDelegate() : null;
    if (delegate == null) {
      throw new IllegalStateException(
          "EvoluApp can't reload: the app has no ReactHost and no current ReactActivity.");
    }
    UiThreadUtil.runOnUiThread(delegate::reload);
  }
}
