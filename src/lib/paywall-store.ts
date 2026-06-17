import { useSyncExternalStore } from "react";

type PaywallState = {
  open: boolean;
  needed: number;
  balance: number;
  agentLabel: string | null;
};

let state: PaywallState = { open: false, needed: 0, balance: 0, agentLabel: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const paywallStore = {
  open(needed: number, balance: number, agentLabel: string | null) {
    state = { open: true, needed, balance, agentLabel };
    emit();
  },
  close() {
    state = { ...state, open: false };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get() {
    return state;
  },
};

export function usePaywallState() {
  return useSyncExternalStore(paywallStore.subscribe, paywallStore.get, paywallStore.get);
}
