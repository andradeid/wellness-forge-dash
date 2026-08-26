import { useSyncExternalStore } from "react";

export type PaywallReason = "insufficient" | "expired";

type PaywallState = {
  open: boolean;
  reason: PaywallReason;
  needed: number;
  balance: number;
  agentLabel: string | null;
  /** ISO da data de vencimento, quando o motivo for assinatura vencida. */
  expiredAt: string | null;
};

const INITIAL: PaywallState = {
  open: false,
  reason: "insufficient",
  needed: 0,
  balance: 0,
  agentLabel: null,
  expiredAt: null,
};

let state: PaywallState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const paywallStore = {
  /** Saldo insuficiente. */
  open(needed: number, balance: number, agentLabel: string | null) {
    state = { open: true, reason: "insufficient", needed, balance, agentLabel, expiredAt: null };
    emit();
  },
  /** Assinatura vencida: leitura liberada, consumo bloqueado. */
  openExpired(expiredAt: string | null, agentLabel: string | null = null) {
    state = { open: true, reason: "expired", needed: 0, balance: 0, agentLabel, expiredAt };
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
