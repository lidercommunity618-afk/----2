import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Signal, SignalDirection, SignalOutcome } from '@/types/domain';

export interface DemoTrade {
  signalId: string;
  stake: number;
  profitPercent: number;
  direction: SignalDirection;
  openedAt: number;
}

export interface DemoTradeHistoryEntry {
  signalId: string;
  outcome: 'win' | 'loss' | 'timeout';
  pnl: number;
  balanceAfter: number;
  closedAt: number;
}

interface DemoAccountState {
  balance: number;
  baseStake: number;
  profitPercent: number;
  autoTradeEnabled: boolean;
  consecutiveLosses: number;
  currentStake: number;
  openTrades: Record<string, DemoTrade>;
  history: DemoTradeHistoryEntry[];
  openTrade: (signal: Signal) => void;
  settleTrade: (signalId: string, outcome: 'win' | 'loss' | 'timeout') => void;
  setBaseStake: (v: number) => void;
  setProfitPercent: (v: number) => void;
  setAutoTradeEnabled: (v: boolean) => void;
  setBalance: (v: number) => void;
  resetAccount: () => void;
}

const DEFAULT_BALANCE = 1000;
const DEFAULT_BASE_STAKE = 10;
const DEFAULT_PROFIT_PERCENT = 80;
const MAX_HISTORY = 30;

export const useDemoAccountStore = create<DemoAccountState>()(
  persist(
    (set, get) => ({
      balance: DEFAULT_BALANCE,
      baseStake: DEFAULT_BASE_STAKE,
      profitPercent: DEFAULT_PROFIT_PERCENT,
      autoTradeEnabled: true,
      consecutiveLosses: 0,
      currentStake: DEFAULT_BASE_STAKE,
      openTrades: {},
      history: [],

      openTrade: (signal) => {
        const state = get();
        if (!state.autoTradeEnabled) return;
        if (state.openTrades[signal.id]) return;
        const trade: DemoTrade = {
          signalId: signal.id,
          stake: state.currentStake,
          profitPercent: state.profitPercent,
          direction: signal.direction,
          openedAt: Date.now(),
        };
        set({
          openTrades: { ...state.openTrades, [signal.id]: trade },
        });
      },

      settleTrade: (signalId, outcome) => {
        const state = get();
        const trade = state.openTrades[signalId];
        if (!trade) return;

        if (outcome === 'timeout') {
          const remaining = { ...state.openTrades };
          delete remaining[signalId];
          set({ openTrades: remaining });
          return;
        }

        let newBalance = state.balance;
        let newConsecutiveLosses = state.consecutiveLosses;
        let newCurrentStake = state.currentStake;
        let pnl = 0;

        if (outcome === 'win') {
          pnl = trade.stake * trade.profitPercent / 100;
          newBalance = state.balance + pnl;
          newConsecutiveLosses = 0;
          newCurrentStake = state.baseStake;
        } else if (outcome === 'loss') {
          pnl = -trade.stake;
          newBalance = state.balance - trade.stake;
          newConsecutiveLosses = state.consecutiveLosses + 1;
          if (newConsecutiveLosses >= 3) {
            newConsecutiveLosses = 0;
            newCurrentStake = state.baseStake;
          } else {
            newCurrentStake = trade.stake * 2;
          }
        }

        const entry: DemoTradeHistoryEntry = {
          signalId,
          outcome,
          pnl,
          balanceAfter: newBalance,
          closedAt: Date.now(),
        };

        const remaining = { ...state.openTrades };
        delete remaining[signalId];

        const newHistory = [entry, ...state.history].slice(0, MAX_HISTORY);

        set({
          balance: newBalance,
          consecutiveLosses: newConsecutiveLosses,
          currentStake: newCurrentStake,
          openTrades: remaining,
          history: newHistory,
        });
      },

      setBaseStake: (v) => set({ baseStake: v, currentStake: v, consecutiveLosses: 0 }),
      setProfitPercent: (v) => set({ profitPercent: v }),
      setAutoTradeEnabled: (v) => set({ autoTradeEnabled: v }),
      setBalance: (v) => set((s) => ({ balance: v, consecutiveLosses: 0, currentStake: s.baseStake })),
      resetAccount: () => set((s) => ({
        balance: DEFAULT_BALANCE,
        baseStake: s.baseStake,
        profitPercent: s.profitPercent,
        autoTradeEnabled: s.autoTradeEnabled,
        consecutiveLosses: 0,
        currentStake: s.baseStake,
        openTrades: {},
        history: [],
      })),
    }),
    {
      name: 'demo-account',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
