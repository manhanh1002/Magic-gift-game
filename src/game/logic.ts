import { Icon } from './types';
import type { GameState, Bids, PlayerId, Player } from './types';

export function createInitialGameState(numPlayers: number): GameState {
  const players: Record<PlayerId, Player> = {};
  const playerOrder: PlayerId[] = [];
  const startingGold = numPlayers * 9;

  // 1 Human
  players['player'] = {
    id: 'player',
    name: 'You',
    gold: startingGold,
    board: [[null, null, null], [null, null, null], [null, null, null]],
    unplacedDice: [],
    isHuman: true,
  };
  playerOrder.push('player');

  // N-1 Bots
  for (let i = 1; i < numPlayers; i++) {
    const botId = `bot${i}`;
    players[botId] = {
      id: botId,
      name: `Computer ${i}`,
      gold: startingGold,
      board: [[null, null, null], [null, null, null], [null, null, null]],
      unplacedDice: [],
      isHuman: false,
    };
    playerOrder.push(botId);
  }

  // Supply is 9 dice per player
  const diceSupply = numPlayers * 9;

  return {
    players,
    playerOrder,
    firstPlayerIndex: 0,
    currentBidderIndex: 0,
    diceSupply,
    roundPhase: 'menu',
    currentBids: getEmptyBids(),
    rolledDice: [],
    log: [`Game started with ${numPlayers} players.`],
  };
}

export function getEmptyBids(): Bids {
  return {
    [Icon.Fire]: [],
    [Icon.Crystal]: [],
    [Icon.Moon]: [],
    [Icon.Nature]: [],
    [Icon.Crown]: [],
    [Icon.Star]: [],
  };
}

export function rollDiceForRound(state: GameState): Icon[] {
  const icons = Object.values(Icon);
  const rolls: Icon[] = [];
  const numToRoll = state.playerOrder.length;
  for (let i = 0; i < numToRoll; i++) {
    rolls.push(icons[Math.floor(Math.random() * icons.length)]);
  }
  return rolls;
}

export function resolveAuctions(state: GameState) {
  const rollCounts: Partial<Record<Icon, number>> = {};
  for (const die of state.rolledDice) {
    rollCounts[die] = (rollCounts[die] || 0) + 1;
  }

  for (const [iconStr, bids] of Object.entries(state.currentBids)) {
    const icon = iconStr as Icon;
    const available = rollCounts[icon] || 0;
    
    if (available === 0) continue;

    // Advanced tie-breaking based on turn order
    // 1. Sort by amount (desc)
    // 2. If amount is tied, sort by distance to firstPlayer (asc)
    bids.sort((a, b) => {
      if (b.amount !== a.amount) {
        return b.amount - a.amount;
      }
      // Tie breaker
      const aIndex = state.playerOrder.indexOf(a.playerId);
      const bIndex = state.playerOrder.indexOf(b.playerId);
      
      const numP = state.playerOrder.length;
      const first = state.firstPlayerIndex;
      
      const aDist = (aIndex - first + numP) % numP;
      const bDist = (bIndex - first + numP) % numP;
      
      return aDist - bDist;
    });
    
    let distributed = 0;
    for (const bid of bids) {
      if (distributed >= available) break;
      if (bid.amount === 0) continue;

      const player = state.players[bid.playerId];
      player.gold -= bid.amount;
      player.unplacedDice.push(icon);
      state.diceSupply--;
      distributed++;
      
      state.log.push(`${player.name} won a ${icon} for ${bid.amount} Gold.`);
    }
  }

  state.roundPhase = 'placement';
  state.currentBids = getEmptyBids();
  state.rolledDice = [];
}
