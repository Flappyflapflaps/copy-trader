
import React from 'react';
import { Play, Pause, AlertTriangle, CheckCircle, Wallet, Zap, Loader, ShieldQuestion } from 'lucide-react';

export const SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

export const ICONS = {
  play: <Play size={20} />,
  pause: <Pause size={20} />,
  error: <AlertTriangle className="text-yellow-400" size={20} />,
  success: <CheckCircle className="text-green-400" size={20} />,
  wallet: <Wallet size={16} />,
  token: <Zap size={16} />,
  loading: <Loader className="text-blue-400 animate-spin" size={20} />,
  info: <ShieldQuestion className="text-slate-400" size={20} />,
};

export const JUPITER_API_BASE_URL = 'https://quote-api.jup.ag/v6';
