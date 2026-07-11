import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CircleHelp, RotateCcw, Sparkles, Trophy, Undo2, X } from 'lucide-react';
import './styles.css';

const SIZE = 6;
const STORAGE_KEY = 'zip-game-v2';

const SPIRAL_PATH = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
  [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5],
  [3, 5], [2, 5], [1, 5], [0, 5], [0, 4], [0, 3],
  [0, 2], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
  [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4],
  [1, 3], [1, 2], [2, 2], [3, 2], [3, 3], [2, 3],
];

const key = ([row, col]) => `${row}-${col}`;
const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');
const sameCell = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

const ROW_SNAKE = Array.from({ length: SIZE }, (_, row) =>
  Array.from({ length: SIZE }, (_, offset) => [row, row % 2 ? SIZE - 1 - offset : offset]),
).flat();

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function transformPath(path, rotation, reflected) {
  return path.map(([originalRow, originalCol]) => {
    let row = originalRow;
    let col = reflected ? SIZE - 1 - originalCol : originalCol;
    for (let turn = 0; turn < rotation; turn += 1) [row, col] = [col, SIZE - 1 - row];
    return [row, col];
  });
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function generateLevel(number = 274, previousSignature = '') {
  let seed = (Date.now() + number * 2654435761) >>> 0;
  let solution;
  let signature;

  do {
    const random = seededRandom(seed);
    const base = random() < 0.52 ? SPIRAL_PATH : ROW_SNAKE;
    solution = transformPath(base, Math.floor(random() * 4), random() > 0.5);
    if (random() > 0.5) solution = [...solution].reverse();
    signature = solution.map(key).join(',');
    seed = (seed + 1013904223) >>> 0;
  } while (signature === previousSignature);

  const random = seededRandom(seed);
  const clueCount = 7 + Math.floor(random() * 3);
  const clueSteps = [0];
  for (let index = 1; index < clueCount - 1; index += 1) {
    const ideal = Math.round(index * ((solution.length - 1) / (clueCount - 1)));
    const jitter = Math.floor(random() * 5) - 2;
    const minimum = clueSteps[clueSteps.length - 1] + 2;
    const maximum = solution.length - 1 - (clueCount - 1 - index) * 2;
    clueSteps.push(Math.max(minimum, Math.min(maximum, ideal + jitter)));
  }
  clueSteps.push(solution.length - 1);

  const solutionEdges = new Set(solution.slice(1).map((cell, index) => edgeKey(solution[index], cell)));
  const wallCandidates = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (col < SIZE - 1) wallCandidates.push(edgeKey([row, col], [row, col + 1]));
      if (row < SIZE - 1) wallCandidates.push(edgeKey([row, col], [row + 1, col]));
    }
  }
  const walls = shuffle(wallCandidates.filter((edge) => !solutionEdges.has(edge)), random)
    .slice(0, 13 + Math.floor(random() * 6));

  return { number, solution, clueSteps, walls, signature };
}

function loadSavedGame() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (
      saved?.puzzle?.solution?.length === SIZE * SIZE
      && saved.puzzle.clueSteps?.length >= 2
      && Array.isArray(saved.puzzle.walls)
      && Array.isArray(saved.path)
      && saved.path.length > 0
    ) return saved;
  } catch {
    // A damaged or old save should never prevent the game from loading.
  }
  const puzzle = generateLevel();
  return { puzzle, path: [puzzle.solution[0]], elapsed: 0, started: false };
}

const INITIAL_GAME = loadSavedGame();

function App() {
  const [puzzle, setPuzzle] = useState(INITIAL_GAME.puzzle);
  const [path, setPath] = useState(INITIAL_GAME.path);
  const [dragging, setDragging] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [hintedCell, setHintedCell] = useState(null);
  const [elapsed, setElapsed] = useState(INITIAL_GAME.elapsed ?? 0);
  const [started, setStarted] = useState(INITIAL_GAME.started ?? false);
  const boardRef = useRef(null);
  const activePointerRef = useRef(null);
  const lastPointerPositionRef = useRef(null);
  const pathRef = useRef(INITIAL_GAME.path);

  const { solution } = puzzle;
  const walls = useMemo(() => new Set(puzzle.walls), [puzzle.walls]);
  const clues = useMemo(() => new Map(
    puzzle.clueSteps.map((step, index) => [key(solution[step]), index + 1]),
  ), [puzzle.clueSteps, solution]);
  const complete = path.length === SIZE * SIZE && path.every((cell, index) => sameCell(cell, solution[index]));
  const pathIndex = useMemo(() => new Map(path.map((cell, index) => [key(cell), index])), [path]);
  const isCorrectPrefix = path.every((cell, index) => sameCell(cell, solution[index]));

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ puzzle, path, elapsed, started }));
  }, [puzzle, path, elapsed, started]);

  useEffect(() => {
    if (!started || complete) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [started, complete]);

  const stopDragging = useCallback((event) => {
    if (event?.pointerId !== undefined && activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    lastPointerPositionRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [stopDragging]);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const canExtend = useCallback((cell, currentPath) => {
    const last = currentPath[currentPath.length - 1];
    if (!adjacent(last, cell) || walls.has(edgeKey(last, cell))) return false;
    if (currentPath.some((item) => sameCell(item, cell))) return false;

    const clue = clues.get(key(cell));
    if (clue) {
      const passedClues = currentPath.filter((item) => clues.has(key(item))).length;
      if (clue !== passedClues + 1) return false;
    }
    return true;
  }, [clues, walls]);

  const visitCell = useCallback((cell) => {
    if (complete) return;
    setStarted(true);
    setHintedCell(null);

    const currentPath = pathRef.current;
    const existingIndex = currentPath.findIndex((item) => sameCell(item, cell));
    if (existingIndex >= 0) {
      if (existingIndex === currentPath.length - 2) {
        const nextPath = currentPath.slice(0, -1);
        pathRef.current = nextPath;
        setPath(nextPath);
      }
      return;
    }
    if (canExtend(cell, currentPath)) {
      const nextPath = [...currentPath, cell];
      pathRef.current = nextPath;
      setPath(nextPath);
    }
  }, [canExtend, complete]);

  const connectToCell = useCallback((target) => {
    const currentPath = pathRef.current;
    const last = currentPath[currentPath.length - 1];
    if (sameCell(last, target) || adjacent(last, target)) {
      visitCell(target);
      return;
    }

    const queue = [{ cell: last, bridge: [] }];
    const seen = new Set([key(last)]);
    const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];

    while (queue.length) {
      const candidate = queue.shift();
      for (const [rowStep, colStep] of directions) {
        const next = [candidate.cell[0] + rowStep, candidate.cell[1] + colStep];
        if (next[0] < 0 || next[0] >= SIZE || next[1] < 0 || next[1] >= SIZE) continue;
        if (seen.has(key(next))) continue;

        const pathToCandidate = [...currentPath, ...candidate.bridge];
        if (!canExtend(next, pathToCandidate)) continue;

        const bridge = [...candidate.bridge, next];
        if (sameCell(next, target)) {
          const nextPath = [...currentPath, ...bridge];
          pathRef.current = nextPath;
          setPath(nextPath);
          setStarted(true);
          setHintedCell(null);
          return;
        }

        seen.add(key(next));
        queue.push({ cell: next, bridge });
      }
    }
  }, [canExtend, visitCell]);

  const cellFromPoint = useCallback((clientX, clientY) => {
    const board = boardRef.current;
    if (!board) return null;
    const bounds = board.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return null;
    return [
      Math.min(SIZE - 1, Math.floor((y / bounds.height) * SIZE)),
      Math.min(SIZE - 1, Math.floor((x / bounds.width) * SIZE)),
    ];
  }, []);

  const visitPointerLine = useCallback((from, to) => {
    const board = boardRef.current;
    if (!board) return;
    const bounds = board.getBoundingClientRect();
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const sampleDistance = Math.min(bounds.width, bounds.height) / (SIZE * 4);
    const steps = Math.max(1, Math.ceil(distance / sampleDistance));

    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps;
      const cell = cellFromPoint(
        from.x + (to.x - from.x) * amount,
        from.y + (to.y - from.y) * amount,
      );
      if (cell) connectToCell(cell);
    }
  }, [cellFromPoint, connectToCell]);

  const handlePointerDown = (event, cell) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    activePointerRef.current = event.pointerId;
    lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };
    boardRef.current?.setPointerCapture?.(event.pointerId);
    setDragging(true);
    connectToCell(cell);
  };

  const handlePointerMove = (event) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const coalescedEvents = event.nativeEvent?.getCoalescedEvents?.();
    const events = coalescedEvents?.length ? coalescedEvents : [event];
    events.forEach((pointerEvent) => {
      const nextPosition = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      const previousPosition = lastPointerPositionRef.current ?? nextPosition;
      visitPointerLine(previousPosition, nextPosition);
      lastPointerPositionRef.current = nextPosition;
    });
  };

  const handlePointerUp = (event) => {
    if (activePointerRef.current !== event.pointerId) return;
    const finishPosition = { x: event.clientX, y: event.clientY };
    const startPosition = lastPointerPositionRef.current ?? finishPosition;
    visitPointerLine(startPosition, finishPosition);
    stopDragging(event);
  };

  const reset = () => {
    const nextPath = [solution[0]];
    pathRef.current = nextPath;
    setPath(nextPath);
    setElapsed(0);
    setStarted(false);
    setHintedCell(null);
  };

  const playAgain = () => {
    const nextPuzzle = generateLevel(puzzle.number + 1, puzzle.signature);
    setPuzzle(nextPuzzle);
    const nextPath = [nextPuzzle.solution[0]];
    pathRef.current = nextPath;
    setPath(nextPath);
    setElapsed(0);
    setStarted(false);
    setHintedCell(null);
  };

  const hint = () => {
    let prefixLength = 0;
    while (prefixLength < path.length && sameCell(path[prefixLength], solution[prefixLength])) prefixLength += 1;
    const correctPath = prefixLength === path.length ? path : solution.slice(0, Math.max(1, prefixLength));
    const next = solution[correctPath.length];
    if (!next) return;
    const nextPath = [...correctPath, next];
    pathRef.current = nextPath;
    setPath(nextPath);
    setHintedCell(key(next));
    setStarted(true);
    window.setTimeout(() => setHintedCell(null), 1100);
  };

  const progress = Math.round((path.length / (SIZE * SIZE)) * 100);
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <main className="app-shell">
      <nav className="topbar">
        <div className="brand-mark" aria-label="Zip home">Z</div>
        <div className="brand-copy">
          <span className="brand-name">ZIP</span>
          <span className="brand-subtitle">DAILY PATH PUZZLE</span>
        </div>
        <button className="icon-button" onClick={() => setShowRules(true)} aria-label="How to play">
          <CircleHelp size={23} strokeWidth={1.8} />
        </button>
      </nav>

      <section className="game-area">
        <header className="puzzle-heading">
          <div>
            <p className="eyebrow">PUZZLE NO. {puzzle.number}</p>
            <h1>Fresh Zip</h1>
          </div>
          <div className="timer-block">
            <span>TIME</span>
            <strong>{time}</strong>
          </div>
        </header>

        <div className="progress-track" aria-label={`${progress}% complete`}>
          <span style={{ width: `${progress}%` }} />
        </div>

        <p className="instruction">Connect the numbers in order. Fill every square.</p>

        <div className="board-wrap">
          <div
            className={`board ${complete ? 'is-complete' : ''} ${dragging ? 'is-dragging' : ''}`}
            ref={boardRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={stopDragging}
          >
            <svg className="path-layer" viewBox={`0 0 ${SIZE * 100} ${SIZE * 100}`} aria-hidden="true">
              <polyline
                points={path.map(([row, col]) => `${col * 100 + 50},${row * 100 + 50}`).join(' ')}
                fill="none"
                stroke="var(--path)"
                strokeWidth="21"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {Array.from({ length: SIZE * SIZE }, (_, index) => {
              const row = Math.floor(index / SIZE);
              const col = index % SIZE;
              const cell = [row, col];
              const id = key(cell);
              const clue = clues.get(id);
              const visited = pathIndex.has(id);
              const order = pathIndex.get(id);
              const wallTop = row > 0 && walls.has(edgeKey(cell, [row - 1, col]));
              const wallRight = col < SIZE - 1 && walls.has(edgeKey(cell, [row, col + 1]));
              const wallBottom = row < SIZE - 1 && walls.has(edgeKey(cell, [row + 1, col]));
              const wallLeft = col > 0 && walls.has(edgeKey(cell, [row, col - 1]));

              return (
                <button
                  key={id}
                  className={`cell ${visited ? 'visited' : ''} ${hintedCell === id ? 'hinted' : ''}`}
                  style={{
                    '--row': row,
                    '--col': col,
                    '--wall-top': wallTop ? '4px solid var(--wall)' : '0',
                    '--wall-right': wallRight ? '4px solid var(--wall)' : '0',
                    '--wall-bottom': wallBottom ? '4px solid var(--wall)' : '0',
                    '--wall-left': wallLeft ? '4px solid var(--wall)' : '0',
                  }}
                  onPointerDown={(event) => handlePointerDown(event, cell)}
                  aria-label={clue ? `Number ${clue}` : `Row ${row + 1}, column ${col + 1}`}
                >
                  {clue && <span className={`clue ${visited ? 'active' : ''}`}>{clue}</span>}
                  {visited && !clue && <span className="path-dot" style={{ '--delay': `${order * 8}ms` }} />}
                </button>
              );
            })}
          </div>

          {complete && (
            <div className="success-card" role="status">
              <div className="trophy"><Trophy size={28} /></div>
              <p>PATH COMPLETE</p>
              <h2>Beautifully done.</h2>
              <span>You zipped through in {time}</span>
              <button onClick={playAgain}>Play again</button>
            </div>
          )}
        </div>

        <div className="controls">
          <button className="control-button" onClick={() => {
            const nextPath = pathRef.current.length > 1 ? pathRef.current.slice(0, -1) : pathRef.current;
            pathRef.current = nextPath;
            setPath(nextPath);
          }} disabled={path.length <= 1 || complete}>
            <Undo2 size={20} /> Undo
          </button>
          <button className="hint-button" onClick={hint} disabled={complete}>
            <Sparkles size={18} fill="currentColor" /> Hint
          </button>
          <button className="control-button" onClick={reset} disabled={path.length <= 1 && elapsed === 0}>
            <RotateCcw size={19} /> Reset
          </button>
        </div>

        <div className={`status-line ${!isCorrectPrefix ? 'warning' : ''}`}>
          <span>{path.length}</span> of {SIZE * SIZE} squares filled
        </div>
      </section>

      <footer>One path. Every square. No shortcuts.</footer>

      {showRules && (
        <div className="modal-backdrop" onPointerDown={() => setShowRules(false)}>
          <section className="rules-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <button className="modal-close" onClick={() => setShowRules(false)} aria-label="Close"><X /></button>
            <p className="eyebrow">HOW TO PLAY</p>
            <h2 id="rules-title">Find the one true path.</h2>
            <ol>
              <li><strong>Start at 1</strong><span>Drag or click through neighboring squares.</span></li>
              <li><strong>Follow the order</strong><span>Reach each numbered tile from lowest to highest.</span></li>
              <li><strong>Fill the board</strong><span>Visit every square exactly once. Walls cannot be crossed.</span></li>
            </ol>
            <button className="got-it" onClick={() => setShowRules(false)}>Got it</button>
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
