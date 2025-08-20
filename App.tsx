
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { authenticateUser, saveState, syncState, onAuthChange } from './services/storageService';
import { createConnection, parsePrivateKey, fetchWhaleEntryPrice, isWhaleTrade } from './services/solanaService';
import { getJupiterPrice, getJupiterSwapTx } from './services/jupiterService';
import type { BotState, BotStatus, WalletEntry } from './types';
import { ICONS, SOL_MINT_ADDRESS } from './constants';
import { ChevronDown, PlusCircle, Trash2, KeyRound, AlertTriangle } from 'lucide-react';


const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;

const initialState: BotState = {
  rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
  privateKey: '',
  walletToWatch: 'HdxkiXqeN6qpK2YbG51W23QSWj3Yygc1eEk2zwmKJExp',
  tokenToWatch: '',
  status: 'idle',
  message: 'Enter your details, then start the bot to watch for a good entry price.',
  entryPrice: null,
  isBotActive: false,
  readyForCopying: false,
  savedWallets: [],
};

// --- UI Components ---

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

const InputField: React.FC<InputFieldProps> = ({ label, value, onChange, placeholder, type = 'text', disabled = false, icon }) => (
  <div>
    <label className="text-sm font-semibold text-slate-300 block mb-2 flex items-center space-x-2">
      {icon}
      <span>{label}</span>
    </label>
    <input
      type={type}
      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  </div>
);

const StatusDisplay: React.FC<{ status: BotStatus; message: string; readyForCopying: boolean }> = ({ status, message, readyForCopying }) => {
  const getIcon = () => {
    if (readyForCopying) return ICONS.success;
    switch (status) {
      case 'watching':
      case 'copying':
        return ICONS.loading;
      case 'error':
        return ICONS.error;
      case 'idle':
        if(message.includes("success") || message.includes("Price condition met") || message.includes("Successfully copied")) return ICONS.success;
        return ICONS.info;
      default:
        return ICONS.info;
    }
  };

  return (
    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center space-x-3 min-h-[72px]">
      {getIcon()}
      <p className="text-sm text-slate-300 flex-1">{message}</p>
    </div>
  );
};

interface WalletManagerProps {
  wallets: WalletEntry[];
  onAdd: (name: string, key: string) => void;
  onApply: (key: string) => void;
  onDelete: (key: string) => void;
  disabled: boolean;
}

const WalletManager: React.FC<WalletManagerProps> = ({ wallets, onAdd, onApply, onDelete, disabled }) => {
    const [name, setName] = useState('');
    const [key, setKey] = useState('');

    const handleAdd = () => {
        if (name.trim() && key.trim()) {
            onAdd(name, key);
            setName('');
            setKey('');
        }
    };

    return (
        <details className="bg-slate-800/50 border border-slate-700 rounded-xl group transition-all duration-300">
            <summary className="p-3 cursor-pointer text-sm font-semibold text-slate-300 flex items-center justify-between list-none">
                <div className="flex items-center space-x-2">
                  <KeyRound size={16} />
                  <span>Saved Wallets (Use with Extreme Caution)</span>
                </div>
                <ChevronDown className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-4 border-t border-slate-700 space-y-4">
                <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 p-3 rounded-lg flex items-start space-x-3">
                    <AlertTriangle size={32} className="flex-shrink-0 mt-0.5" />
                    <p className="text-xs"><strong>EXTREME RISK:</strong> Saving private keys is dangerous. Anyone with access to your app data could steal your funds. <strong>NEVER use a main wallet.</strong> Only use a temporary "burner" wallet for testing.</p>
                </div>

                <div className="space-y-2">
                    <input
                        type="text"
                        placeholder="New Wallet Name (e.g. Burner 1)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 text-sm"
                        disabled={disabled}
                    />
                    <input
                        type="password"
                        placeholder="Private Key (JSON array format)"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 text-sm"
                        disabled={disabled}
                    />
                    <button
                        onClick={handleAdd}
                        disabled={disabled || !name.trim() || !key.trim()}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <PlusCircle size={16} />
                        <span>Add & Save Wallet</span>
                    </button>
                </div>
                
                {wallets.length > 0 && (
                    <div className="space-y-2 pt-2">
                        <h4 className="text-sm font-semibold text-slate-400">Your Wallets</h4>
                        {wallets.map((wallet) => (
                            <div key={wallet.name} className="flex items-center justify-between bg-slate-900/70 p-2 rounded-lg">
                                <span className="text-sm font-medium text-slate-300 truncate pl-2">{wallet.name}</span>
                                <div className="flex items-center space-x-1">
                                    <button onClick={() => onApply(wallet.privateKey)} disabled={disabled} className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-700 transition-colors">Apply</button>
                                    <button onClick={() => onDelete(wallet.privateKey)} disabled={disabled} className="p-1.5 text-slate-400 hover:text-red-500 disabled:text-slate-600 rounded-md transition-colors"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </details>
    );
};


// --- Main App Component ---

export default function App() {
  const [botState, setBotState] = useState<BotState>(() => {
    const savedStateJSON = localStorage.getItem('solana-copy-trader-state');
    if (savedStateJSON) {
      const savedState = JSON.parse(savedStateJSON);
      if (!savedState.savedWallets) {
        savedState.savedWallets = [];
      }
      return savedState;
    }
    return initialState;
  });
  const [userId, setUserId] = useState<string | null>('local-user');

  const connection = useMemo(() => botState.rpcUrl ? createConnection(botState.rpcUrl) : null, [botState.rpcUrl]);
  const userKeypair = useMemo(() => botState.privateKey ? parsePrivateKey(botState.privateKey) : null, [botState.privateKey]);

  const updateState = useCallback((updates: Partial<BotState>) => {
    setBotState(prevState => ({ ...prevState, ...updates }));
  }, []);

  const handleStopBot = useCallback(() => {
    updateState({ isBotActive: false, status: 'idle', message: 'Bot stopped by user.' });
  }, [updateState]);

  // --- Effects ---

  // 1. Persist State Changes to localStorage
  useEffect(() => {
    const handler = setTimeout(() => {
      saveState('local-user', botState);
    }, 1000);
    return () => clearTimeout(handler);
  }, [botState]);

  // 3. Main Bot Logic Loop
  useEffect(() => {
    if (!botState.isBotActive || !connection || !userKeypair || !botState.walletToWatch || !botState.tokenToWatch) {
      return;
    }

    let subscriptionId: number | undefined;
    let priceWatchIntervalId: ReturnType<typeof setInterval> | undefined;
    
    // Phase 1: Watch price if an entry price is set
    if (botState.entryPrice !== null && !botState.readyForCopying) {
      priceWatchIntervalId = setInterval(async () => {
        if (botState.entryPrice === null) return; // Guard against race conditions
        
        const currentPrice = await getJupiterPrice(botState.tokenToWatch);
        if (currentPrice !== null) {
          updateState({ message: `Watching price... Current: ${currentPrice.toFixed(6)} SOL. Target: ~${botState.entryPrice.toFixed(6)} SOL.` });
          if (currentPrice <= botState.entryPrice) {
            clearInterval(priceWatchIntervalId);
            updateState({
              isBotActive: false, // Stop bot activity, wait for user
              status: 'idle',
              entryPrice: null,
              readyForCopying: true,
              message: `Price condition met at ${currentPrice.toFixed(6)} SOL! Press "Start Copying" to begin.`
            });
          }
        }
      }, 5000); // Check price every 5 seconds

    } else { // Phase 2: Listen for whale trades
      updateState({ status: 'watching', message: `Actively watching ${botState.walletToWatch} for trades of the specified token.`});
      const whalePubKey = new PublicKey(botState.walletToWatch);

      subscriptionId = connection.onLogs(whalePubKey, async (logs, context) => {
          if (logs.err) return;
          
          const tx = await connection.getParsedTransaction(logs.signature, { maxSupportedTransactionVersion: 0 });
          if (!tx) return;

          const { isTrade, isBuy } = isWhaleTrade(tx, botState.walletToWatch, botState.tokenToWatch);

          if (isTrade) {
              updateState({ status: 'copying', message: `Whale trade detected! Signature: ${logs.signature}. Preparing to copy...` });
              try {
                  const tradeAmountLamports = 10000000; // 0.01 SOL
                  const inputMint = isBuy ? new PublicKey(SOL_MINT_ADDRESS) : new PublicKey(botState.tokenToWatch);
                  const outputMint = isBuy ? new PublicKey(botState.tokenToWatch) : new PublicKey(SOL_MINT_ADDRESS);
                  
                  const swapTx = await getJupiterSwapTx(userKeypair.publicKey, inputMint, outputMint, tradeAmountLamports);
                  
                  const swapTxByteString = atob(swapTx);
                  const swapTxBuf = Uint8Array.from(swapTxByteString, (c) => c.charCodeAt(0));
                  const transaction = VersionedTransaction.deserialize(swapTxBuf);
                  transaction.sign([userKeypair]);
                  
                  const signature = await connection.sendTransaction(transaction, { skipPreflight: true });
                  updateState({ status: 'copying', message: `Copy trade sent! Signature: ${signature}. Confirming...` });
                  
                  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                  await connection.confirmTransaction({
                      signature,
                      blockhash,
                      lastValidBlockHeight,
                  }, 'confirmed');

                  updateState({ status: 'watching', message: `Successfully copied ${isBuy ? 'buy' : 'sell'} trade. Resuming watch.` });
              } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  console.error('Copy trade failed:', error);
                  updateState({ status: 'error', message: `Copy trade failed: ${errorMessage}` });
              }
          }
      }, 'confirmed');
    }
    
    return () => {
      if (subscriptionId) connection.removeOnLogsListener(subscriptionId);
      if (priceWatchIntervalId) clearInterval(priceWatchIntervalId);
    };
  }, [botState.isBotActive, connection, userKeypair, botState.walletToWatch, botState.tokenToWatch, botState.entryPrice, botState.readyForCopying, updateState]);

  // --- Wallet Management Handlers ---

  const handleAddWallet = (name: string, privateKey: string) => {
    const newWallet: WalletEntry = { name, privateKey };
    const walletExists = botState.savedWallets.some(w => w.name === name || w.privateKey === privateKey);
    if (!walletExists) {
        updateState({ savedWallets: [...botState.savedWallets, newWallet] });
    } else {
        updateState({ status: 'error', message: 'A wallet with this name or key already exists.' });
    }
  };

  const handleApplyWallet = (privateKey: string) => {
      updateState({ privateKey });
  };

  const handleDeleteWallet = (privateKeyToDelete: string) => {
      updateState({
          savedWallets: botState.savedWallets.filter(w => w.privateKey !== privateKeyToDelete),
      });
  };

  // --- Event Handlers ---

  const handleStartBot = async () => {
    if (!connection || !userKeypair) {
      updateState({ status: 'error', message: 'RPC URL or Private Key is invalid.' });
      return;
    }

    // This is phase 2: User confirmed to start copy trading after price condition was met
    if (botState.readyForCopying) {
        updateState({ 
            isBotActive: true, 
            status: 'watching', 
            message: 'Starting copy-trading listener...',
            readyForCopying: false,
            entryPrice: null, // Ensure entry price is null
        });
        return;
    }

    // This is phase 1: Find whale entry price and wait for drop
    updateState({ status: 'watching', message: "Fetching whale's last buy transaction to find entry price..." });
    try {
      const price = await fetchWhaleEntryPrice(connection, botState.walletToWatch, botState.tokenToWatch);
      if (price !== null) {
        updateState({
          entryPrice: price,
          isBotActive: true,
          status: 'watching',
          message: `Whale entry price found at ${price.toFixed(6)} SOL. Now waiting for market price to drop to this level.`
        });
      } else {
        updateState({ status: 'error', message: 'Could not find a recent buy transaction for the whale.' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(error);
      updateState({ status: 'error', message: `Error finding entry price: ${errorMessage}` });
    }
  };
  
  const isFormInvalid = !botState.rpcUrl || !botState.privateKey || !botState.walletToWatch || !botState.tokenToWatch;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl shadow-2xl shadow-blue-500/10 p-8 space-y-6 max-w-lg w-full">
        <h1 className="text-3xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-600 pb-1">Solana Copy Trader</h1>
        <p className="text-xs text-center text-slate-500">
          Mode: <code className="text-blue-400">Local Storage (Data saved on this PC)</code>
        </p>
        
        <StatusDisplay status={botState.status} message={botState.message} readyForCopying={botState.readyForCopying} />

        <div className="space-y-4">
          <InputField label="RPC Endpoint URL" value={botState.rpcUrl} onChange={e => updateState({ rpcUrl: e.target.value })} placeholder="e.g., Helius, QuickNode, Triton" disabled={botState.isBotActive} />
          <div>
            <InputField label="Your Private Key" value={botState.privateKey} onChange={e => updateState({ privateKey: e.target.value })} placeholder="e.g., [1,2,3,...]" type="password" disabled={botState.isBotActive} />
             <p className="text-xs text-slate-500 mt-1.5 mx-1">
              Requires the <span className="font-bold text-slate-400">JSON array format</span> from a wallet export (e.g., Phantom/Solflare).
            </p>
          </div>
          
          <WalletManager 
            wallets={botState.savedWallets}
            onAdd={handleAddWallet}
            onApply={handleApplyWallet}
            onDelete={handleDeleteWallet}
            disabled={botState.isBotActive}
          />

          <InputField label="Whale Wallet to Watch" value={botState.walletToWatch} onChange={e => updateState({ walletToWatch: e.target.value })} placeholder="Enter public key of wallet to copy" disabled={botState.isBotActive} icon={ICONS.wallet} />
          <InputField label="Token to Trade" value={botState.tokenToWatch} onChange={e => updateState({ tokenToWatch: e.target.value })} placeholder="Enter token mint address" disabled={botState.isBotActive} icon={ICONS.token} />
        </div>

        <div className="flex flex-col space-y-4 pt-2">
          <button
            onClick={botState.isBotActive ? handleStopBot : handleStartBot}
            className={`flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
              botState.isBotActive 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700'
            }`}
            disabled={isFormInvalid && !botState.isBotActive}
          >
            {botState.isBotActive ? (
              <>{ICONS.pause} <span>Stop Bot</span></>
            ) : (
              <>{ICONS.play} <span>{botState.readyForCopying ? "Start Copying" : "Start Price Watch"}</span></>
            )}
          </button>
        </div>
         <p className="text-xs text-center text-slate-600 pt-2">
          Disclaimer: This is a high-risk tool. Use with caution and at your own risk. Never share your private key.
        </p>
      </div>
    </div>
  );
}