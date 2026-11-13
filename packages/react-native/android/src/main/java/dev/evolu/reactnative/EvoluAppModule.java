package dev.evolu.reactnative;

import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.system.Os;
import android.system.OsConstants;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactDelegate;
import com.facebook.react.ReactHost;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.UiThreadUtil;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The TurboModule EvoluApp on Android: the directory of the database files,
 * React Native's own reload, and the app's DeviceSecret, which an Android
 * Keystore key encrypts, so no app needs Expo for any of them. Java, so neither
 * AGP's built-in Kotlin nor R8 rules matter: React Native's consumer rule keeps
 * every NativeModule.
 */
public class EvoluAppModule extends NativeEvoluAppSpec {
  public static final String NAME = "EvoluApp";

  private static final int GCM_IV_LENGTH = 12;
  private static final int GCM_TAG_LENGTH = 16;

  /**
   * One thread, so this process never takes the file lock of get-or-add and
   * forget twice, which FileLock rejects, and the Keystore's binder calls stay
   * off the JavaScript and UI threads.
   */
  private static final ExecutorService deviceSecretExecutor =
      Executors.newSingleThreadExecutor();

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
   * A stored DeviceSecret this module can't read: its record is too short to
   * hold an IV and a tag, its Keystore key is gone or, as Android 13 and later
   * report, the Keystore's database entry of that key is corrupted, or its
   * decryption fails authentication. Evolu never
   * deletes a stored secret on its own, so the record stays until the app
   * forgets it.
   */
  private static final class UnreadableDeviceSecretException extends Exception {
    UnreadableDeviceSecretException(String message, Throwable cause) {
      super(message, cause);
    }
  }

  /**
   * Returns the app's DeviceSecret, or stores `secret` and returns it when there
   * is none. AES-GCM with a Keystore key of the app's name encrypts it, the
   * name as its associated data, into a file in the directory backups leave
   * out, so a restored backup, whose Keystore key never leaves its device,
   * starts with a new secret. A stored secret is never replaced: the device
   * database opens only with it, so a stored secret it can't read rejects with
   * the code `Unreadable`, and any other failure with `Keystore`.
   */
  @Override
  public void getOrAddDeviceSecret(String appName, String secret, Promise promise) {
    runDeviceSecretStep(
        promise, (directory) -> getOrAddLockedDeviceSecret(directory, appName, secret));
  }

  /**
   * Deletes the app's DeviceSecret record and the Keystore key of the app's
   * name, if any, so the next get-or-add starts clean, whatever made the record
   * unreadable. The other names have keys of their own.
   */
  @Override
  public void forgetDeviceSecret(String appName, Promise promise) {
    runDeviceSecretStep(
        promise,
        (directory) -> {
          File file = deviceSecretFile(directory, appName);
          if (file.exists() && !file.delete()) {
            throw new IOException("The DeviceSecret file couldn't be deleted.");
          }
          syncDirectory(directory);
          // After the record, so a failure here leaves a key that no record
          // uses, which the next get-or-add replaces.
          KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
          keyStore.load(null);
          String alias = deviceSecretKeyAlias(appName);
          // containsAlias returns false rather than throwing for an entry
          // Keystore can't read, and the next get-or-add replaces it.
          if (keyStore.containsAlias(alias)) {
            keyStore.deleteEntry(alias);
          }
          return null;
        });
  }

  /** A step of get-or-add or forget, which runs under the file lock. */
  @FunctionalInterface
  private interface DeviceSecretStep {
    Object run(File directory) throws Exception;
  }

  /**
   * Runs a step on deviceSecretExecutor and resolves the promise with its
   * result. Every process of the app shares the directory and the Keystore
   * aliases, so a lock on a file makes get-or-add and forget one step across
   * processes, as the Keychain's operations are on iOS. The kernel releases it
   * when its process dies. A stored secret the step can't read rejects with the
   * code `Unreadable`, and any other failure with `Keystore`.
   */
  private void runDeviceSecretStep(Promise promise, DeviceSecretStep step) {
    deviceSecretExecutor.execute(
        () -> {
          try {
            File directory = getReactApplicationContext().getNoBackupFilesDir();
            try (FileChannel lockChannel =
                    new RandomAccessFile(new File(directory, "evolu-device-secret.lock"), "rw")
                        .getChannel();
                FileLock lock = lockChannel.lock()) {
              promise.resolve(step.run(directory));
            }
          } catch (UnreadableDeviceSecretException e) {
            promise.reject("Unreadable", e.getMessage(), e);
          } catch (Exception e) {
            promise.reject("Keystore", e.getMessage(), e);
          }
        });
  }

  private static File deviceSecretFile(File directory, String appName) {
    return new File(directory, "evolu-device-secret-" + appName);
  }

  /**
   * Each name has a Keystore key of its own, so forgetting one name's secret
   * deletes no key another name needs. An app name has at most 41 URL-safe
   * characters, which the Keystore of every supported Android takes in an
   * alias.
   */
  private static String deviceSecretKeyAlias(String appName) {
    return "dev.evolu.deviceSecret." + appName;
  }

  private String getOrAddLockedDeviceSecret(File directory, String appName, String secret)
      throws Exception {
    File file = deviceSecretFile(directory, appName);
    String alias = deviceSecretKeyAlias(appName);
    byte[] associatedData = appName.getBytes(StandardCharsets.UTF_8);
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");

    if (file.exists()) {
      byte[] stored = new byte[(int) file.length()];
      try (DataInputStream in = new DataInputStream(new FileInputStream(file))) {
        in.readFully(stored);
      }
      // Checked here, because providers fail a shorter record with exceptions
      // of their own, some of which don't tell it from a Keystore failure.
      if (stored.length < GCM_IV_LENGTH + GCM_TAG_LENGTH) {
        throw new UnreadableDeviceSecretException(
            "The stored DeviceSecret is too short to hold an IV and a tag.", null);
      }
      SecretKey key = getStoredKey(keyStore, alias);
      if (key == null) {
        throw new UnreadableDeviceSecretException(
            "The Keystore key of the stored DeviceSecret is gone.", null);
      }
      cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, stored, 0, GCM_IV_LENGTH));
      cipher.updateAAD(associatedData);
      byte[] plaintext;
      try {
        plaintext = cipher.doFinal(stored, GCM_IV_LENGTH, stored.length - GCM_IV_LENGTH);
      } catch (AEADBadTagException e) {
        throw new UnreadableDeviceSecretException(
            "The stored DeviceSecret fails authentication.", e);
      }
      // A process killed after its rename, before syncing the directory, left
      // the file's name unsynced.
      syncDirectory(directory);
      return new String(plaintext, StandardCharsets.UTF_8);
    }

    // No record uses the name's key, so a new one replaces any, also one the
    // Keystore broke.
    KeyGenerator generator =
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(
        new KeyGenParameterSpec.Builder(
                alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
    SecretKey key = generator.generateKey();
    // The Keystore generates the IV, so every encryption gets a fresh one.
    cipher.init(Cipher.ENCRYPT_MODE, key);
    cipher.updateAAD(associatedData);
    byte[] iv = cipher.getIV();
    byte[] ciphertext = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
    if (iv.length != GCM_IV_LENGTH) {
      throw new IllegalStateException("The Keystore generated an IV of " + iv.length + " bytes.");
    }
    // Written in full and synced before its rename, so a crash leaves either no
    // file or the whole one.
    File temporary = new File(directory, file.getName() + ".new");
    try (FileOutputStream out = new FileOutputStream(temporary)) {
      out.write(iv);
      out.write(ciphertext);
      out.getFD().sync();
    }
    if (!temporary.renameTo(file)) {
      throw new IOException("The DeviceSecret file couldn't be renamed into place.");
    }
    syncDirectory(directory);
    return secret;
  }

  /**
   * The key under the alias, or null when there is none. A key the Keystore
   * can't load fails with `UnrecoverableKeyException`, also when the Keystore
   * itself fails for a while, so it's unreadable only when Android 13 or later
   * reports its database entry corrupted; earlier versions don't tell. A key
   * blob KeyMint can't use isn't reported here: its entry loads, and
   * `cipher.init` fails, as a Keystore failure.
   */
  private static SecretKey getStoredKey(KeyStore keyStore, String alias) throws Exception {
    try {
      return (SecretKey) keyStore.getKey(alias, null);
    } catch (UnrecoverableKeyException e) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && Api33.isKeyCorrupted(e)) {
        throw new UnreadableDeviceSecretException(
            "The Keystore key of the stored DeviceSecret is corrupted.", e);
      }
      throw e;
    }
  }

  /** Android 13's API, in a class of its own, which older versions never load. */
  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private static final class Api33 {
    /**
     * Whether the cause chain holds the Keystore's report of a corrupted key,
     * which Keystore 2 reports only for a corrupted entry of its own database.
     * Other failures that aren't transient include the Keystore's own system
     * errors, after which the key can still be intact.
     */
    static boolean isKeyCorrupted(Throwable error) {
      for (Throwable cause = error; cause != null; cause = cause.getCause()) {
        if (cause instanceof android.security.KeyStoreException) {
          return ((android.security.KeyStoreException) cause).getNumericErrorCode()
              == android.security.KeyStoreException.ERROR_KEY_CORRUPTED;
        }
      }
      return false;
    }
  }

  /**
   * A rename lasts only once its directory is synced, and the device database a
   * DeviceSecret encrypts can outlast a power loss without it.
   */
  private static void syncDirectory(File directory) throws Exception {
    FileDescriptor descriptor = Os.open(directory.getPath(), OsConstants.O_RDONLY, 0);
    try {
      Os.fsync(descriptor);
    } finally {
      Os.close(descriptor);
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
