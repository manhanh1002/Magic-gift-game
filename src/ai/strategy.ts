import { Icon } from '../game/types';
import type { GameState, PlayerId } from '../game/types';
import { calculateScore } from '../game/scoring';

// Heuristic function to evaluate the potential of a board state
export function evaluateBoardScore(board: (Icon | null)[][]): number {
  let score = 0;
  
  // 1. Get base VP from actual completed formations
  const actualScore = calculateScore(board, 0);
  score += actualScore.totalVp * 100; // Heavily weight actual points
  
  // 2. Add heuristic points for partial formations (pairs)
  
  const addHeuristic = (cells: {r: number, c: number}[]) => {
    const icons = cells.map(c => board[c.r][c.c]).filter(i => i !== null) as Icon[];
    if (icons.length === 2) {
      if (icons[0] === icons[1]) {
        score += 10; // Pair of identical icons (potential for 3-identical or crossing)
      } else {
        score += 2; // Pair of different icons (potential for 5-of-6 different)
      }
    }
  };

  // Rows and Cols
  for (let i = 0; i < 3; i++) {
    addHeuristic([{r: i, c: 0}, {r: i, c: 1}, {r: i, c: 2}]);
    addHeuristic([{r: 0, c: i}, {r: 1, c: i}, {r: 2, c: i}]);
  }
  
  // Diagonals
  addHeuristic([{r: 0, c: 0}, {r: 1, c: 1}, {r: 2, c: 2}]);
  addHeuristic([{r: 0, c: 2}, {r: 1, c: 1}, {r: 2, c: 0}]);
  
  // Squares
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const sqIcons = [
        board[r][c], board[r][c+1], 
        board[r+1][c], board[r+1][c+1]
      ].filter(i => i !== null) as Icon[];
      
      if (sqIcons.length === 3) {
        if (sqIcons[0] === sqIcons[1] && sqIcons[1] === sqIcons[2]) {
          score += 15; // 3 identical in a square, just needs 1 more for 4-identical
        }
        const distinct = new Set(sqIcons).size;
        if (distinct === 3) {
          score += 5; // 3 distinct in a square, potential for 4-different
        }
      }
    }
  }

  // Bonus for center piece if it matches other things
  const center = board[1][1];
  if (center !== null) {
    score += 5; // Center is inherently valuable
  }
  
  return score;
}

// Find the best placement for a specific die on the board
export function findBestPlacement(board: (Icon | null)[][], die: Icon): {r: number, c: number} {
  const emptySpots: {r: number, c: number}[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!board[r][c]) emptySpots.push({r, c});
    }
  }
  
  if (emptySpots.length === 0) return {r: 0, c: 0}; // Should not happen
  
  let bestSpot = emptySpots[0];
  let bestScore = -1;
  
  for (const spot of emptySpots) {
    board[spot.r][spot.c] = die; // Temporarily place
    const score = evaluateBoardScore(board);
    board[spot.r][spot.c] = null; // Remove
    
    if (score > bestScore) {
      bestScore = score;
      bestSpot = spot;
    } else if (score === bestScore) {
      // Tie breaker, prioritize center or corners
      if (spot.r === 1 && spot.c === 1) bestSpot = spot;
    }
  }
  
  return bestSpot;
}

// Determine which icons the AI wants most (priority score 0 to 100)
export function getIconPriorities(state: GameState, botId: PlayerId): Record<Icon, number> {
  const computer = state.players[botId];
  const priorities: Record<Icon, number> = {
    [Icon.Fire]: 0,
    [Icon.Crystal]: 0,
    [Icon.Moon]: 0,
    [Icon.Nature]: 0,
    [Icon.Crown]: 0,
    [Icon.Star]: 0,
  };
  
  const icons = Object.values(Icon);
  
  // Base priority from testing what happens if we get this icon
  for (const icon of icons) {
    const bestSpot = findBestPlacement(computer.board, icon);
    if (!computer.board[bestSpot.r][bestSpot.c]) {
      computer.board[bestSpot.r][bestSpot.c] = icon;
      const score = evaluateBoardScore(computer.board);
      computer.board[bestSpot.r][bestSpot.c] = null;
      priorities[icon] = score;
    }
  }
  
  // Normalize priorities so the best is around 10
  const maxScore = Math.max(...Object.values(priorities), 1);
  for (const icon of icons) {
    priorities[icon] = Math.floor((priorities[icon] / maxScore) * 10);
  }
  
  // Defensive bidding: Add some priority based on human's board
  if (state.players['player']) {
    const human = state.players['player'];
    for (const icon of icons) {
      const bestSpot = findBestPlacement(human.board, icon);
      if (!human.board[bestSpot.r][bestSpot.c]) {
        human.board[bestSpot.r][bestSpot.c] = icon;
        const humanScore = evaluateBoardScore(human.board);
        human.board[bestSpot.r][bestSpot.c] = null;
        // If human placing this icon yields a big score increase, add priority
        // Very basic defense weight
        priorities[icon] += Math.floor(humanScore / 100); 
      }
    }
  }
  
  return priorities;
}
