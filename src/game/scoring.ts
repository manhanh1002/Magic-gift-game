import { Icon } from './types';
import type { ScoreDetails } from './types';

interface FormationResult {
  name: string;
  vp: number;
  gold: number;
  diceUsed: { r: number; c: number }[];
  type: 'line' | 'square';
}

export function calculateScore(board: (Icon | null)[][], remainingGold: number): ScoreDetails {
  // Check Legendary Formation (all 9 same)
  let allSame = true;
  const first = board[0][0];
  if (first) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (board[r][c] !== first) allSame = false;
      }
    }
  } else {
    allSame = false;
  }

  if (allSame) {
    return {
      formations: [{ name: 'Legendary Formation', vp: 999, gold: 0 }],
      formationVp: 999,
      formationGold: 0,
      goldBeforeConversion: remainingGold,
      totalGold: remainingGold,
      goldVp: 0,
      totalVp: 999,
      legendary: true,
    };
  }

  const lines: FormationResult[] = [];
  const squares: FormationResult[] = [];

  // Helper to check if a set of cells are all the same
  const allIdentical = (cells: { r: number; c: number }[]) => {
    const val = board[cells[0].r][cells[0].c];
    if (!val) return false;
    return cells.every(cell => board[cell.r][cell.c] === val);
  };

  // Helper to count distinct icons
  const countDistinct = (cells: { r: number; c: number }[]) => {
    const set = new Set();
    for (const cell of cells) {
      const val = board[cell.r][cell.c];
      if (!val) return 0;
      set.add(val);
    }
    return set.size;
  };

  // 1. Find Crossings
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // Crossing is row R and col C
      const crossCells = [
        {r, c:0}, {r, c:1}, {r, c:2},
        {r:0, c}, {r:1, c}, {r:2, c}
      ];
      // unique cells
      const uniqueCross = Array.from(new Set(crossCells.map(x => `${x.r},${x.c}`))).map(str => {
        const [rr, cc] = str.split(',').map(Number);
        return {r: rr, c: cc};
      });

      if (allIdentical(uniqueCross)) {
        // Check remaining 4 cells
        const remaining = [];
        for (let ir = 0; ir < 3; ir++) {
          for (let ic = 0; ic < 3; ic++) {
            if (ir !== r && ic !== c) remaining.push({r: ir, c: ic});
          }
        }
        
        if (remaining.length === 4 && allIdentical(remaining)) {
          const crossVal = board[r][c];
          const remainVal = board[remaining[0].r][remaining[0].c];
          if (crossVal === remainVal) {
             lines.push({ name: 'Crossing, Two Identical Icons', vp: 15, gold: 12, diceUsed: uniqueCross, type: 'line' });
          } else {
             lines.push({ name: 'Crossing, Two Different Icons', vp: 12, gold: 12, diceUsed: uniqueCross, type: 'line' });
          }
        }
      }
    }
  }

  // 2. Six Identical & Five of Six Different
  // Check pairs of rows
  const rowPairs = [[0,1], [0,2], [1,2]];
  for (const [r1, r2] of rowPairs) {
    const cells = [
      {r: r1, c: 0}, {r: r1, c: 1}, {r: r1, c: 2},
      {r: r2, c: 0}, {r: r2, c: 1}, {r: r2, c: 2}
    ];
    if (allIdentical(cells)) {
      lines.push({ name: 'Six Identical Icons (Rows)', vp: 9, gold: 9, diceUsed: cells, type: 'line' });
    } else if (countDistinct(cells) === 5) {
      lines.push({ name: 'Five of Six Different Icons (Rows)', vp: 9, gold: 9, diceUsed: cells, type: 'line' });
    }
  }
  // Check pairs of columns
  const colPairs = [[0,1], [0,2], [1,2]];
  for (const [c1, c2] of colPairs) {
    const cells = [
      {r: 0, c: c1}, {r: 1, c: c1}, {r: 2, c: c1},
      {r: 0, c: c2}, {r: 1, c: c2}, {r: 2, c: c2}
    ];
    if (allIdentical(cells)) {
      lines.push({ name: 'Six Identical Icons (Cols)', vp: 9, gold: 9, diceUsed: cells, type: 'line' });
    } else if (countDistinct(cells) === 5) {
      lines.push({ name: 'Five of Six Different Icons (Cols)', vp: 9, gold: 9, diceUsed: cells, type: 'line' });
    }
  }

  // 3. Three Identical (Rows, Cols, Diags)
  for (let r = 0; r < 3; r++) {
    const cells = [{r, c:0}, {r, c:1}, {r, c:2}];
    if (allIdentical(cells)) lines.push({ name: 'Three Identical Icons (Row)', vp: 3, gold: 3, diceUsed: cells, type: 'line' });
  }
  for (let c = 0; c < 3; c++) {
    const cells = [{r:0, c}, {r:1, c}, {r:2, c}];
    if (allIdentical(cells)) lines.push({ name: 'Three Identical Icons (Col)', vp: 3, gold: 3, diceUsed: cells, type: 'line' });
  }
  const diag1 = [{r:0,c:0}, {r:1,c:1}, {r:2,c:2}];
  if (allIdentical(diag1)) lines.push({ name: 'Three Identical Icons (Diag)', vp: 3, gold: 3, diceUsed: diag1, type: 'line' });
  const diag2 = [{r:0,c:2}, {r:1,c:1}, {r:2,c:0}];
  if (allIdentical(diag2)) lines.push({ name: 'Three Identical Icons (Diag)', vp: 3, gold: 3, diceUsed: diag2, type: 'line' });

  // 4. Squares (2x2)
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const cells = [
        {r, c}, {r, c: c+1},
        {r: r+1, c}, {r: r+1, c: c+1}
      ];
      if (allIdentical(cells)) {
        squares.push({ name: 'Four Identical Icons (Square)', vp: 5, gold: 5, diceUsed: cells, type: 'square' });
      } else if (countDistinct(cells) === 4) {
        squares.push({ name: 'Four Different Icons (Square)', vp: 3, gold: 3, diceUsed: cells, type: 'square' });
      }
    }
  }

  // The One Rule: Find the combination of valid lines and squares that yields the max VP + GoldVP
  // Helper to check if two formations share a die
  const shareDie = (f1: FormationResult, f2: FormationResult) => {
    for (const d1 of f1.diceUsed) {
      for (const d2 of f2.diceUsed) {
        if (d1.r === d2.r && d1.c === d2.c) return true;
      }
    }
    return false;
  };

  // Find all valid non-overlapping subsets of lines
  const validLineSubsets: FormationResult[][] = [[]];
  for (const line of lines) {
    const newSubsets = [];
    for (const subset of validLineSubsets) {
      if (subset.every(existing => !shareDie(existing, line))) {
        newSubsets.push([...subset, line]);
      }
    }
    validLineSubsets.push(...newSubsets);
  }

  // Find all valid non-overlapping subsets of squares
  const validSquareSubsets: FormationResult[][] = [[]];
  for (const sq of squares) {
    const newSubsets = [];
    for (const subset of validSquareSubsets) {
      if (subset.every(existing => !shareDie(existing, sq))) {
        newSubsets.push([...subset, sq]);
      }
    }
    validSquareSubsets.push(...newSubsets);
  }

  let bestScore = -1;
  let bestCombination: FormationResult[] = [];

  for (const lSub of validLineSubsets) {
    for (const sSub of validSquareSubsets) {
      const combo = [...lSub, ...sSub];
      let vp = 0;
      let gold = 0;
      for (const f of combo) {
        vp += f.vp;
        gold += f.gold;
      }
      
      const totalGold = remainingGold + gold;
      const goldVp = Math.floor(totalGold / 2);
      const totalVp = vp + goldVp;

      // Rulebook says: always score the single highest-value tier.
      // We do this implicitly by maximizing VP + GoldVP
      if (totalVp > bestScore) {
        bestScore = totalVp;
        bestCombination = combo;
      } else if (totalVp === bestScore) {
        // Tie breaker: maximize VP over GoldVP, or just take the one with higher formation VP?
        // Let's just maximize formation VP if tied
        let bestComboVp = bestCombination.reduce((acc, f) => acc + f.vp, 0);
        if (vp > bestComboVp) {
          bestCombination = combo;
        }
      }
    }
  }

  let formationVp = 0;
  let formationGold = 0;
  bestCombination.forEach(f => {
    formationVp += f.vp;
    formationGold += f.gold;
  });

  const totalGold = remainingGold + formationGold;
  const goldVp = Math.floor(totalGold / 2);

  return {
    formations: bestCombination.map(f => ({ name: f.name, vp: f.vp, gold: f.gold })),
    formationVp,
    formationGold,
    goldBeforeConversion: remainingGold,
    totalGold,
    goldVp,
    totalVp: formationVp + goldVp,
    legendary: false,
  };
}
