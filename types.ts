export type BotStatus = 'idle' | 'watching' | 'copying' | 'error';

export interface WalletEntry {
  name: string;
  privateKey: string;
}

export interface BotState {
  rpcUrl: string;
  privateKey: string;
  walletToWatch: string;
  tokenToWatch: string;
  status: BotStatus;
  message: string;
  entryPrice: number | null;
  isBotActive: boolean;
  readyForCopying: boolean;
  savedWallets: WalletEntry[];
}
