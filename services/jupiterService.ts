
import { PublicKey } from '@solana/web3.js';
import { JUPITER_API_BASE_URL, SOL_MINT_ADDRESS } from '../constants';

interface JupiterPriceResponse {
  data: {
    [key: string]: {
      price: number;
    };
  };
}

// --- Price Fetching ---

export async function getJupiterPrice(tokenMint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://price.jup.ag/v4/price?ids=${tokenMint}&vsToken=${SOL_MINT_ADDRESS}`);
    if (!response.ok) throw new Error('Jupiter Price API request failed.');
    
    const data: JupiterPriceResponse = await response.json();
    const price = data.data?.[tokenMint]?.price;
    
    return price ?? null;
  } catch (error) {
    console.error('Error fetching Jupiter price:', error);
    return null;
  }
}

// --- Swapping Logic ---

export async function getJupiterSwapTx(
  userPublicKey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number, // amount in lamports
  slippageBps: number = 50 // 0.5%
): Promise<string> {
    
  // 1. Get a quote
  const quoteResponse = await fetch(`${JUPITER_API_BASE_URL}/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}`);
  
  if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      throw new Error(`Failed to get Jupiter quote: ${errorText}`);
  }
  const quoteData = await quoteResponse.json();

  // 2. Get the serialized transaction
  const swapResponse = await fetch(`${JUPITER_API_BASE_URL}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: userPublicKey.toBase58(),
      wrapAndUnwrapSol: true,
      // Optional: Add priority fee here if needed
      // prioritizationFeeLamports: 10000 
    }),
  });
  
  if (!swapResponse.ok) {
    const errorText = await swapResponse.text();
    throw new Error(`Failed to get Jupiter swap transaction: ${errorText}`);
  }
  const swapData = await swapResponse.json();
  
  if (!swapData.swapTransaction) {
    throw new Error('Invalid swap response from Jupiter API.');
  }

  return swapData.swapTransaction;
}
