import { defineStore } from 'pinia';

interface LockState {
  isLockScreen: boolean;
  lockScreenPassword: string | undefined;
  lockScreenSalt: string | undefined;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoded.buffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  const hashArray = [...new Uint8Array(bits)];
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function saltToHex(salt: Uint8Array): string {
  return [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToSalt(hex: string): Uint8Array {
  const bytes =
    hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
  return new Uint8Array(bytes);
}

/** Legacy SHA-256 hash for migration from old lock format */
async function legacySha256(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const useLockStore = defineStore('lock-store', () => {
  const state = useStorage<LockState>('lock-state', {
    isLockScreen: false,
    lockScreenPassword: undefined,
    lockScreenSalt: undefined,
  });

  async function lockScreen(password: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hashed = await deriveKey(password, salt);
    state.value = {
      isLockScreen: true,
      lockScreenPassword: hashed,
      lockScreenSalt: saltToHex(salt),
    };
  }

  async function unlockScreen(password: string): Promise<boolean> {
    const storedSalt = state.value.lockScreenSalt;
    const storedPassword = state.value.lockScreenPassword;

    // Migrate old SHA-256 format (no salt, 64-char hex hash)
    if (!storedSalt && storedPassword?.length === 64) {
      const legacyHash = await legacySha256(password);
      if (legacyHash !== storedPassword) return false;
      // Upgrade to PBKDF2 format
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const newHash = await deriveKey(password, salt);
      state.value = {
        isLockScreen: false,
        lockScreenPassword: newHash,
        lockScreenSalt: saltToHex(salt),
      };
      return true;
    }

    if (!storedSalt) return false;
    const salt = hexToSalt(storedSalt);
    const hashed = await deriveKey(password, salt);
    if (hashed !== storedPassword) {
      return false;
    }
    resetLockScreen();
    return true;
  }

  function resetLockScreen() {
    state.value = {
      isLockScreen: false,
      lockScreenPassword: undefined,
      lockScreenSalt: undefined,
    };
  }

  return {
    ...state,
    lockScreen,
    unlockScreen,
    resetLockScreen,
  };
});
