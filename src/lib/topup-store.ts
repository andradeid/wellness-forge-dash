import { useSyncExternalStore } from "react";

type TopUpState = { open: boolean };

let state: TopUpState = { open: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const topUpStore = {
  open() {
    state = { open: true };
    emit();
  },
  close() {
    state = { open: false };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  get() {
    return state;
  },
};

export function useTopUpState() {
  return useSyncExternalStore(topUpStore.subscribe, topUpStore.get, topUpStore.get);
}
