import type {
  DeviceEvolu,
  EvoluApp,
  EvoluSchema,
} from "@evolu/common/local-first";
import type { createEvoluBinding } from "./createEvoluBinding.ts";
import { useEvoluApp } from "./EvoluAppProvider.ts";

/**
 * Vue composable returning {@link EvoluApp.device}, the instance of the device
 * database with the app's own device tables. Applications should prefer
 * {@link createEvoluBinding} for proper typing.
 */
export const useDeviceEvolu = (): DeviceEvolu<EvoluSchema> =>
  useEvoluApp().device;
