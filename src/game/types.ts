export const Icon = {
  Fire: '🔥',
  Crystal: '💎',
  Moon: '🌙',
  Nature: '🌿',
  Crown: '👑',
  Star: '⭐',
} as const;

export type Icon = (typeof Icon)[keyof typeof Icon];

export type PlayerId = string; // E.g., 'player', 'bot1', 'bot2'

export interface Player {
  id: PlayerId;
  name: string;
  gold: number;
  vp: number;
  awardedFormationVp: number;
  awardedFormationGold: number;
  board: (Icon | null)[][]; // 3x3 grid
  unplacedDice: Icon[]; // Dice won this round that need placing
  isHuman: boolean;
}

export interface Bid {
  playerId: PlayerId;
  amount: number;
}

export type Bids = Record<Icon, Bid[]>;

export interface GameState {
  players: Record<PlayerId, Player>;
  playerOrder: PlayerId[]; // Determines seating/tie-break order
  firstPlayerIndex: number;
  currentBidderIndex: number;
  diceSupply: number;
  roundPhase: 'menu' | 'initial-setup' | 'bidding' | 'rolling' | 'resolving' | 'placement' | 'end';
  currentBids: Bids;
  rolledDice: Icon[];
  log: string[]; // Game event log
}

export interface ScoreDetails {
  formations: { name: string; vp: number; gold: number }[];
  formationVp: number;
  formationGold: number;
  goldBeforeConversion: number;
  totalGold: number;
  goldVp: number;
  totalVp: number;
  legendary: boolean;
}
