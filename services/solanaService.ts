
import { Connection, PublicKey, Keypair, VersionedTransaction, ParsedTransactionWithMeta } from '@solana/web3.js';
import { SOL_MINT_ADDRESS } from '../constants';
import * as bs58 from 'bs58';

// --- Connection ---

export function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, 'confirmed');
}

// --- Key Management ---

export function parsePrivateKey(key: string): Keypair | null {
  if (!key) return null;
  const trimmedKey = key.trim();

  // Try parsing as JSON array first (e.g., from Phantom export)
  if (trimmedKey.startsWith('[') && trimmedKey.endsWith(']')) {
    try {
      const secretKeyArray = JSON.parse(trimmedKey);
      if (Array.isArray(secretKeyArray) && secretKeyArray.every(n => typeof n === 'number')) {
        return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
      }
    } catch (e) {
      // It looked like a JSON array but wasn't valid. Fall through to Base58 check.
      console.warn("Could not parse key as JSON array, will try Base58.", e);
    }
  }

  // If not a valid JSON array, try decoding as Base58
  try {
    const secretKeyBytes = bs58.decode(trimmedKey);
    // A typical Solana private key is 64 bytes long.
    if (secretKeyBytes.length === 64) {
      return Keypair.fromSecretKey(secretKeyBytes);
    } else {
        console.error("Decoded Base58 key is not 64 bytes long.");
    }
  } catch (e) {
    // Not a valid Base58 string either.
    // This console.error is expected if the user enters neither format.
  }
  
  console.error("Failed to parse private key. Please provide it as a JSON array or a Base58 string.");
  return null;
}

// --- Transaction Execution ---

export async function sendAndConfirmTransaction(connection: Connection, serializedTransaction: string): Promise<string> {
  const byteString = atob(serializedTransaction);
  const transactionBuffer = Uint8Array.from(byteString, c => c.charCodeAt(0));
  const transaction = VersionedTransaction.deserialize(transactionBuffer);
  
  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');

  return signature;
}


// --- Whale Watching Logic ---

export async function fetchWhaleEntryPrice(connection: Connection, whaleWallet: string, tokenMint: string): Promise<number | null> {
  const whalePubKey = new PublicKey(whaleWallet);
  const signatures = await connection.getSignaturesForAddress(whalePubKey, { limit: 75 });

  if (signatures.length === 0) {
    throw new Error('No transactions found for the whale wallet.');
  }

  // Fetch details of recent transactions
  const transactions = await connection.getParsedTransactions(signatures.map(s => s.signature), {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed'
  });

  // Find the last transaction where the whale BOUGHT the token
  for (const tx of transactions) {
    if (!tx || tx.meta?.err) continue;

    const whaleIndex = tx.transaction.message.accountKeys.findIndex(acc => acc.pubkey.equals(whalePubKey));
    if (whaleIndex === -1) continue;
    
    const preSolBalance = tx.meta.preBalances[whaleIndex];
    const postSolBalance = tx.meta.postBalances[whaleIndex];
    
    const preTokenBalance = tx.meta.preTokenBalances?.find(b => b.owner === whaleWallet && b.mint === tokenMint)?.uiTokenAmount.uiAmount ?? 0;
    const postTokenBalance = tx.meta.postTokenBalances?.find(b => b.owner === whaleWallet && b.mint === tokenMint)?.uiTokenAmount.uiAmount ?? 0;

    const solChange = (postSolBalance - preSolBalance) / 1e9; // SOL
    const tokenChange = postTokenBalance - preTokenBalance;

    // A buy is when token amount increases and SOL amount decreases
    if (tokenChange > 0 && solChange < 0) {
      const price = Math.abs(solChange / tokenChange);
      console.log(`Found a buy transaction (${tx.transaction.signatures[0]}): ${tokenChange.toFixed(4)} tokens for ${Math.abs(solChange).toFixed(4)} SOL. Price: ${price.toFixed(6)} SOL`);
      return price;
    }
  }

  throw new Error('Could not find a recent buy transaction for the specified token to determine entry price.');
}


export function isWhaleTrade(tx: ParsedTransactionWithMeta, whaleWallet: string, tokenMint: string): { isTrade: boolean; isBuy: boolean; isSell: boolean; } {
    if (!tx || tx.meta?.err) {
        return { isTrade: false, isBuy: false, isSell: false };
    }

    const preToken = tx.meta.preTokenBalances?.find(b => b.owner === whaleWallet && b.mint === tokenMint);
    const postToken = tx.meta.postTokenBalances?.find(b => b.owner === whaleWallet && b.mint === tokenMint);

    const preTokenAmount = preToken?.uiTokenAmount.uiAmount ?? 0;
    const postTokenAmount = postToken?.uiTokenAmount.uiAmount ?? 0;

    const tokenChange = postTokenAmount - preTokenAmount;

    const isBuy = tokenChange > 0;
    const isSell = tokenChange < 0;

    return { isTrade: isBuy || isSell, isBuy, isSell };
}

// --- Balance Checking ---

export async function getTokenBalance(connection: Connection, owner: PublicKey, tokenMint: PublicKey): Promise<{ lamports: bigint, decimals: number }> {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: tokenMint });
    if (tokenAccounts.value.length === 0) {
        return { lamports: BigInt(0), decimals: 0 }; // Assume 0 if no account found
    }
    const tokenAccountInfo = tokenAccounts.value[0].account.data.parsed.info;
    return {
        lamports: BigInt(tokenAccountInfo.tokenAmount.amount),
        decimals: tokenAccountInfo.tokenAmount.decimals,
    };
}

// --- Helius API for Metadata ---

async function getTokenMetadata(rpcUrl: string, mintAddress: string): Promise<{ symbol: string } | null> {
    if (!rpcUrl.includes('helius')) return null; // Only works with Helius RPC
    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'text-id',
                method: 'getAsset',
                params: { id: mintAddress },
            }),
        });
        const { result } = await response.json();
        return { symbol: result.content?.metadata?.symbol || 'N/A' };
    } catch (error) {
        console.error("Failed to fetch token metadata:", error);
        return null;
    }
}


export async function fetchRecentBuys(connection: Connection, rpcUrl: string, whaleWallet: string): Promise<any[]> {
    const whalePubKey = new PublicKey(whaleWallet);
    const signatures = await connection.getSignaturesForAddress(whalePubKey, { limit: 100 });

    if (signatures.length === 0) return [];

    const transactions = await connection.getParsedTransactions(signatures.map(s => s.signature), {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
    });

    const buys = [];
    for (const tx of transactions) {
        if (buys.length >= 10) break;
        if (!tx || tx.meta?.err) continue;

        const whaleIndex = tx.transaction.message.accountKeys.findIndex(acc => acc.pubkey.equals(whalePubKey));
        if (whaleIndex === -1) continue;

        const preSol = tx.meta.preBalances[whaleIndex];
        const postSol = tx.meta.postBalances[whaleIndex];
        const solChange = (postSol - preSol) / 1e9;

        if (solChange >= 0) continue; // Not a buy if SOL didn't decrease

        for (const tb of tx.meta.postTokenBalances || []) {
            if (tb.owner === whaleWallet) {
                const preBalance = tx.meta.preTokenBalances?.find(pre => pre.mint === tb.mint && pre.owner === whaleWallet)?.uiTokenAmount.uiAmount ?? 0;
                if (tb.uiTokenAmount.uiAmount > preBalance) {
                     // It's a buy of this token
                    const metadata = await getTokenMetadata(rpcUrl, tb.mint);
                    buys.push({
                        signature: tx.transaction.signatures[0],
                        timestamp: tx.blockTime,
                        tokenMint: tb.mint,
                        solAmount: Math.abs(solChange),
                        tokenSymbol: metadata?.symbol,
                    });
                    // Break inner loop to not double-count buys in complex swaps
                    break;
                }
            }
        }
    }
    return buys;
}