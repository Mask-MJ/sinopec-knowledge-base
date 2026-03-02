import { defineStore } from 'pinia';

interface LockState {
  /**
   * 是否锁屏
   */
  isLockScreen: boolean;
  /**
   * 锁屏密码
   */
  lockScreenPassword: string | undefined;
}

export const useLockStore = defineStore('lock-store', () => {
  const state = useStorage<LockState>('lock-state', {
    isLockScreen: false,
    lockScreenPassword: undefined,
  });

  function lockScreen(password: string) {
    state.value.isLockScreen = true;
    state.value.lockScreenPassword = password;
  }

  function unlockScreen() {
    state.value.isLockScreen = false;
    state.value.lockScreenPassword = undefined;
  }

  return {
    ...state,
    lockScreen,
    unlockScreen,
  };
});
