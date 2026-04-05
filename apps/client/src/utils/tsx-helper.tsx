import type { Slots } from 'vue';

import { isFunction } from 'lodash-es';

/**
 * @description:  Get slot to prevent empty error
 */
export function getSlot(slots: Slots, slot = 'default', data?: unknown) {
  if (!Reflect.has(slots, slot)) {
    return null;
  }
  if (!isFunction(slots[slot])) {
    console.error(`${slot} is not a function!`);
    return null;
  }
  return slots[slot](data);
}

/**
 * extends slots
 * @param slots
 * @param excludeKeys
 */
export function extendSlots(slots: Slots, excludeKeys: string[] = []) {
  const slotKeys = Object.keys(slots);
  const ret: Record<string, unknown> = {};
  slotKeys.forEach((key) => {
    if (!excludeKeys.includes(key)) {
      ret[key] = (data?: unknown) => getSlot(slots, key, data);
    }
  });
  return ret as Record<string, (...args: unknown[]) => unknown>;
}
