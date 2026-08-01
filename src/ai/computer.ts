import { Icon } from '../game/types';
import type { GameState, PlayerId } from '../game/types';
import { getIconPriorities, findBestPlacement } from './strategy';

export function generateComputerBids(state: GameState, botId: PlayerId): Record<Icon, number> {
  const computer = state.players[botId];
  const gold = computer.gold;
  
  const bids: Record<Icon, number> = {
    [Icon.Fire]: 0,
    [Icon.Crystal]: 0,
    [Icon.Moon]: 0,
    [Icon.Nature]: 0,
    [Icon.Crown]: 0,
    [Icon.Star]: 0,
  };

  let remainingGold = Math.min(gold, 15); // Don't spend more than 15 per round
  const icons = Object.values(Icon);
  
  // 1. Evaluate priorities using Strategy Engine
  const priorities = getIconPriorities(state, botId);
  
  // Sort icons by priority (descending)
  icons.sort((a, b) => priorities[b] - priorities[a]);
  
  // 2. Bid on the top 2 or 3 icons
  const numBids = Math.floor(Math.random() * 2) + 2; // 2 to 3 bids
  
  for (let i = 0; i < numBids; i++) {
    const icon = icons[i];
    const priority = priorities[icon];
    
    if (remainingGold <= 0) break;
    
    // Allocate gold based on priority
    // Higher priority = higher max possible bid
    const maxBidForThis = Math.min(remainingGold, priority + 2);
    
    // Randomize slightly but weight towards maxBidForThis
    let bidAmount = Math.floor(Math.random() * maxBidForThis) + 1;
    
    // Find unique bid amount
    const existingBids = state.currentBids[icon].map(b => b.amount);
    let attempts = 0;
    while (existingBids.includes(bidAmount) && attempts < 10) {
      bidAmount++;
      attempts++;
    }

    if (bidAmount > remainingGold || existingBids.includes(bidAmount)) {
      continue; // Skip if no valid bid found or not enough gold
    }

    bids[icon] = bidAmount;
    remainingGold -= bidAmount;
  }

  return bids;
}

export function placeComputerDice(state: GameState, botId: PlayerId) {
  const computer = state.players[botId];
  
  while (computer.unplacedDice.length > 0) {
    const die = computer.unplacedDice.pop()!;
    
    // 1. Use Strategy Engine to find the best placement
    const bestSpot = findBestPlacement(computer.board, die);
    
    if (!computer.board[bestSpot.r][bestSpot.c]) {
      computer.board[bestSpot.r][bestSpot.c] = die;
      state.log.push(`${computer.name} placed a ${die}.`);
    } else {
      // Fallback if something went wrong (shouldn't happen)
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (!computer.board[r][c]) {
             computer.board[r][c] = die;
             state.log.push(`${computer.name} placed a ${die} at fallback.`);
             break;
          }
        }
      }
    }
  }
}

export function doComputerInitialSetup(state: GameState, botId: PlayerId) {
  const computer = state.players[botId];
  const icons = Object.values(Icon);
  const chosenIcon = icons[Math.floor(Math.random() * icons.length)];
  
  // Strategy: Place in the center for maximum line potential
  computer.board[1][1] = chosenIcon;
  state.diceSupply--;
  state.log.push(`${computer.name} picked ${chosenIcon} and placed it on their board as starting die.`);
}
