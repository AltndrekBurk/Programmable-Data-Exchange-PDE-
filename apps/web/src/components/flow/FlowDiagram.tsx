'use client';

import React, { useRef, useEffect, useState } from 'react';

// ═══════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════
interface NodeDef {
  id: string;
  label: string[];
  cx: number;
  cy: number;
  w: number;
  h: number;
  color: string;
  bgColor: string;
  desc: string;
}

interface EdgeDef {
  id: string;
  from: string;
  to: string;
  label: string;
  cp1: [number, number];
  cp2: [number, number];
  color: string;
}

interface Particle {
  edgeId: string;
  t: number;
  speed: number;
  trail: Array<{ x: number; y: number }>;
}

interface AnimState {
  particles: Particle[];
  lastSpawnTime: Record<string, number>;
  dashOffset: number;
  lastTime: number;
  rafId: number;
}

const LW = 1000;
const LH = 750;
const TRAIL_LEN = 20;
const BASE_SPEED = 0.0022;
const SPAWN_INTERVAL = 3000;

// ═══════════════════════════════════════════════════
// NODES (SİSTEM AKTÖRLERİ)
// ═══════════════════════════════════════════════════
const NODES: NodeDef[] = [
  {
    id: 'escrow',
    label: ['Soroban Escrow', '& AI-Register'],
    cx: 500,
    cy: 380,
    w: 220,
    h: 90,
    color: '#10b981',
    bgColor: 'rgba(6,78,59,0.95)',
    desc: 'Central authority. USDC escrow, provider registration (AI-Register) and post-proof payout logic live here.',
  },
  {
    id: 'buyer',
    label: ['Data Requester', '(Buyer)'],
    cx: 200,
    cy: 150,
    w: 170,
    h: 60,
    color: '#ffffff',
    bgColor: 'rgba(30,30,30,0.95)',
    desc: 'Selects an MCP from the marketplace, configures it, and opens a task on Soroban using the MCP CID.',
  },
  {
    id: 'marketplace',
    label: ['Marketplace', '& IPFS (MCP)'],
    cx: 800,
    cy: 150,
    w: 190,
    h: 60,
    color: '#0ea5e9',
    bgColor: 'rgba(8,47,73,0.95)',
    desc: 'Lists MCP skills by their IPFS CIDs. Buyers pick standards; creators earn per usage.',
  },
  {
    id: 'creator',
    label: ['MCP Creator'],
    cx: 920,
    cy: 50,
    w: 140,
    h: 40,
    color: '#818cf8',
    bgColor: 'rgba(49,46,129,0.95)',
    desc: 'Publishes data-fetch logic to IPFS and defines the economic terms for each MCP.',
  },
  {
    id: 'seller',
    label: ['Data Provider', '(Seller)'],
    cx: 150,
    cy: 380,
    w: 170,
    h: 60,
    color: '#f472b6',
    bgColor: 'rgba(80,7,36,0.95)',
    desc: 'Registers policy with AI-Register, connects OpenClaw bot, and accepts or rejects tasks.',
  },
  {
    id: 'platform',
    label: ['Platform', '(X402 & ZK-TLS)'],
    cx: 650,
    cy: 620,
    w: 230,
    h: 80,
    color: '#ffffff',
    bgColor: 'rgba(20,20,20,0.95)',
    desc: 'Facilitator. Orchestrates ZK-TLS fetch, validates X402 payment headers, and signals Soroban release().',
  },
  {
    id: 'datasource',
    label: ['Data Source', '(API / Device)'],
    cx: 440,
    cy: 710,
    w: 170,
    h: 50,
    color: '#9ca3af',
    bgColor: 'rgba(15,15,15,0.95)',
    desc: 'External APIs and devices like Fitbit or Google Health; never touch the platform directly.',
  },
  {
    id: 'feedback',
    label: ['Feedback', '& Rating'],
    cx: 500,
    cy: 100,
    w: 170,
    h: 60,
    color: '#fbbf24',
    bgColor: 'rgba(69,26,3,0.95)',
    desc: 'Buyer rates the MCP and data quality; scores are recorded on-chain for marketplace reputation.',
  },
  {
    id: 'openclaw',
    label: ['OpenClaw Bot'],
    cx: 170,
    cy: 650,
    w: 180,
    h: 50,
    color: '#22c55e',
    bgColor: 'rgba(4,47,33,0.95)',
    desc: 'Self-hosted agent that listens to Stellar events, talks to the provider and pulls data from the source under the provider policy.',
  },
];

// ═══════════════════════════════════════════════════
// EDGES (AKIŞ ÇİZGİLERİ)
// ═══════════════════════════════════════════════════
const EDGES: EdgeDef[] = [
  // Creator -> Marketplace
  {
    id: 'e_cre_mp',
    from: 'creator',
    to: 'marketplace',
    label: 'MCP deploy (IPFS CID)',
    cp1: [900, 100],
    cp2: [850, 120],
    color: '#818cf8',
  },

  // Buyer -> Marketplace -> Escrow
  {
    id: 'e_buy_mp',
    from: 'buyer',
    to: 'marketplace',
    label: 'Select MCP & CID',
    cp1: [400, 100],
    cp2: [600, 100],
    color: '#0ea5e9',
  },
  {
    id: 'e_buy_esc',
    from: 'buyer',
    to: 'escrow',
    label: 'Open task (task CID)',
    cp1: [250, 250],
    cp2: [350, 320],
    color: '#ffffff',
  },

  // Seller -> Escrow
  {
    id: 'e_sel_esc',
    from: 'seller',
    to: 'escrow',
    label: 'AI-Register (policy CID)',
    cp1: [250, 380],
    cp2: [350, 380],
    color: '#f472b6',
  },

  // Escrow -> Seller -> Platform (accept flow)
  {
    id: 'e_esc_sel',
    from: 'escrow',
    to: 'seller',
    label: 'Job notify (SSE)',
    cp1: [350, 420],
    cp2: [250, 420],
    color: '#10b981',
  },
  {
    id: 'e_sel_plat',
    from: 'seller',
    to: 'platform',
    label: 'Accept (consent TX)',
    cp1: [200, 550],
    cp2: [450, 620],
    color: '#f472b6',
  },

  // Platform -> Data -> Escrow
  {
    id: 'e_plat_data',
    from: 'platform',
    to: 'datasource',
    label: 'Attestor / zk-TLS config',
    cp1: [600, 660],
    cp2: [520, 690],
    color: '#ffffff',
  },
  {
    id: 'e_plat_esc',
    from: 'platform',
    to: 'escrow',
    label: 'ZK proof & release()',
    cp1: [650, 500],
    cp2: [550, 450],
    color: '#ffffff',
  },

  // Platform -> Buyer (data delivery)
  {
    id: 'e_plat_buy',
    from: 'platform',
    to: 'buyer',
    label: 'X402 encrypted delivery',
    cp1: [850, 500],
    cp2: [800, 300],
    color: '#10b981',
  },

  // Feedback flow
  {
    id: 'e_buy_fdb',
    from: 'buyer',
    to: 'feedback',
    label: 'Feedback (IPFS)',
    cp1: [300, 100],
    cp2: [400, 100],
    color: '#fbbf24',
  },
  {
    id: 'e_fdb_esc',
    from: 'feedback',
    to: 'escrow',
    label: 'Update quality score',
    cp1: [500, 180],
    cp2: [500, 280],
    color: '#fbbf24',
  },
  // Escrow -> Marketplace (creator rewards / MCP volume arc)
  {
    id: 'e_esc_mp',
    from: 'escrow',
    to: 'marketplace',
    label: 'MCP volume · creator rewards',
    cp1: [560, 340],
    cp2: [720, 220],
    color: '#fbbf24',
  },
  // Provider-side agent path: Seller -> OpenClaw -> Data Source
  {
    id: 'e_sel_oc',
    from: 'seller',
    to: 'openclaw',
    label: 'Bot channel (WhatsApp/API)',
    cp1: [170, 500],
    cp2: [170, 610],
    color: '#22c55e',
  },
  {
    id: 'e_oc_data',
    from: 'openclaw',
    to: 'datasource',
    label: 'TLS session · zkFetch',
    cp1: [250, 690],
    cp2: [340, 710],
    color: '#22c55e',
  },
  // Escrow -> OpenClaw (Stellar events / task stream)
  {
    id: 'e_esc_oc',
    from: 'escrow',
    to: 'openclaw',
    label: 'Stellar events (tasks)',
    cp1: [430, 480],
    cp2: [260, 620],
    color: '#22c55e',
  },
];

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getBorderPt(node: NodeDef, dx: number, dy: number): [number, number] {
  const hw = node.w / 2;
  const hh = node.h / 2;
  if (dx === 0 && dy === 0) return [node.cx, node.cy];
  const mag = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (dx / mag) * hw;
  const ny = (dy / mag) * hh;
  return [node.cx + nx, node.cy + ny];
}

function getEdgeCurve(edge: EdgeDef) {
  const from = NODES.find(n => n.id === edge.from)!;
  const to = NODES.find(n => n.id === edge.to)!;
  const p0: [number, number] = getBorderPt(from, edge.cp1[0] - from.cx, edge.cp1[1] - from.cy);
  const p3: [number, number] = getBorderPt(to, edge.cp2[0] - to.cx, edge.cp2[1] - to.cy);
  return {
    p0,
    p1: edge.cp1,
    p2: edge.cp2,
    p3,
  };
}

function cbPt(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * mt * p0[0] +
      3 * mt * mt * t * p1[0] +
      3 * mt * t * t * p2[0] +
      t * t * t * p3[0],
    mt * mt * mt * p0[1] +
      3 * mt * mt * t * p1[1] +
      3 * mt * t * t * p2[1] +
      t * t * t * p3[1],
  ];
}

function spawnParticle(edgeId: string): Particle {
  return {
    edgeId,
    t: 0,
    speed: BASE_SPEED * (0.8 + Math.random() * 0.4),
    trail: [],
  };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  ts: number,
  state: AnimState & { activeNode: string | null },
) {
  const { particles, dashOffset, activeNode } = state;

  ctx.clearRect(0, 0, LW, LH);

  // background grid
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, LW, LH);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < LW; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, LH);
    ctx.stroke();
  }
  for (let y = 0; y < LH; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(LW, y);
    ctx.stroke();
  }

  // edges
  EDGES.forEach(edge => {
    const { p0, p1, p2, p3 } = getEdgeCurve(edge);
    const isActive =
      activeNode && (edge.from === activeNode || edge.to === activeNode);

    ctx.save();
    ctx.strokeStyle = isActive ? edge.color : 'rgba(148,163,184,0.5)';
    ctx.lineWidth = isActive ? 2 : 1.4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    ctx.stroke();

    if (isActive) {
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -dashOffset;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
      ctx.stroke();
    }
    ctx.restore();

    // simple label
    const mid = cbPt(0.5, p0, p1, p2, p3);
    ctx.save();
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isActive ? edge.color : 'rgba(148,163,184,0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(edge.label, mid[0], mid[1] - 6);
    ctx.restore();
  });

  // particles
  particles.forEach(p => {
    const edge = EDGES.find(e => e.id === p.edgeId);
    if (!edge) return;
    const { p0, p1, p2, p3 } = getEdgeCurve(edge);

    p.trail.forEach((pt, i) => {
      const alpha = (i + 1) / p.trail.length;
      ctx.fillStyle = `rgba(34,197,94,${alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    const pos = cbPt(p.t, p0, p1, p2, p3);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // nodes
  NODES.forEach(node => {
    const isActive = activeNode === node.id;
    const x0 = node.cx - node.w / 2;
    const y0 = node.cy - node.h / 2;

    ctx.save();
    ctx.fillStyle = node.bgColor;
    drawRoundRect(ctx, x0, y0, node.w, node.h, 12);
    ctx.fill();

    ctx.lineWidth = isActive ? 2.5 : 1.5;
    ctx.strokeStyle = isActive ? node.color : 'rgba(148,163,184,0.5)';
    drawRoundRect(ctx, x0, y0, node.w, node.h, 12);
    ctx.stroke();

    ctx.fillStyle = node.color;
    ctx.font = `${isActive ? 700 : 500} 12px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (node.label.length === 1) {
      ctx.fillText(node.label[0], node.cx, node.cy);
    } else {
      const lineH = 16;
      const totalH = (node.label.length - 1) * lineH;
      node.label.forEach((line, i) => {
        ctx.fillText(line, node.cx, node.cy - totalH / 2 + i * lineH);
      });
    }
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════
export function FlowDiagram() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const stateRef = useRef<AnimState>({
    particles: [],
    lastSpawnTime: {},
    dashOffset: 0,
    lastTime: 0,
    rafId: 0,
  });

  useEffect(() => {
    const state = stateRef.current;
    EDGES.forEach(edge => {
      state.lastSpawnTime[edge.id] = -Math.random() * SPAWN_INTERVAL;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = LW * dpr;
    canvas.height = LH * dpr;
    ctx.scale(dpr, dpr);

    const state = stateRef.current;

    function tick(ts: number) {
      const dt = Math.min(ts - (state.lastTime || ts), 60);
      state.lastTime = ts;
      const dtN = dt / 16.667;

      state.dashOffset += 0.8 * dtN;

      // update particles
      state.particles.forEach(p => {
        p.t += p.speed * dtN;
        const edge = EDGES.find(e => e.id === p.edgeId);
        if (!edge) return;
        const { p0, p1, p2, p3 } = getEdgeCurve(edge);
        const pos = cbPt(Math.min(p.t, 1), p0, p1, p2, p3);
        p.trail.push({ x: pos[0], y: pos[1] });
        if (p.trail.length > TRAIL_LEN) p.trail.shift();
      });
      state.particles = state.particles.filter(p => p.t < 1.05);

      // spawn new particles
      EDGES.forEach(edge => {
        const last = state.lastSpawnTime[edge.id] ?? 0;
        if (ts - last > SPAWN_INTERVAL) {
          state.particles.push(spawnParticle(edge.id));
          state.lastSpawnTime[edge.id] = ts;
        }
      });

      drawFrame(ctx!, ts, { ...state, activeNode });
      state.rafId = requestAnimationFrame(tick);
    }

    state.rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(state.rafId);
  }, [activeNode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (LW / rect.width);
    const y = (e.clientY - rect.top) * (LH / rect.height);
    const clicked = NODES.find(
      n =>
        x >= n.cx - n.w / 2 &&
        x <= n.cx + n.w / 2 &&
        y >= n.cy - n.h / 2 &&
        y <= n.cy + n.h / 2,
    );
    setActiveNode(prev => (prev === clicked?.id ? null : clicked?.id ?? null));
  };

  const activeNodeDef = NODES.find(n => n.id === activeNode);

  return (
    <div className="w-full bg-[#050505] p-6 md:p-8 rounded-[32px] font-sans selection:bg-emerald-500/30">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6">
        <div className="max-w-xl">
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">
            System <span className="text-emerald-500">Flow</span>
          </h2>
          <p className="text-white/50 text-xs md:text-sm leading-relaxed">
            From MCP definition and escrow funding to ZK-TLS verification, X402 settlement and
            on-chain feedback. Click any node to see its role.
          </p>
        </div>
        <div className="flex gap-3 text-[11px]">
          <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="text-emerald-400/70 font-medium uppercase tracking-wider">
              Payment Rail
            </div>
            <div className="text-white/80 font-mono">Soroban · USDC · X402</div>
          </div>
          <div className="px-3 py-2 bg-sky-500/10 border border-sky-500/20 rounded-xl">
            <div className="text-sky-400/70 font-medium uppercase tracking-wider">
              Data Layer
            </div>
            <div className="text-white/80 font-mono">IPFS · ZK-TLS</div>
          </div>
        </div>
      </div>

      <div className="relative border border-white/5 rounded-[24px] overflow-hidden bg-black/40">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-auto cursor-crosshair block"
          style={{ aspectRatio: `${LW}/${LH}` }}
        />

        {activeNodeDef && (
          <div className="absolute top-4 left-4 max-w-xs p-4 rounded-2xl bg-black/80 border border-white/10 backdrop-blur">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: activeNodeDef.color }}
              />
              <div className="text-sm font-semibold text-white">
                {activeNodeDef.label.join(' ')}
              </div>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              {activeNodeDef.desc}
            </p>
            <div className="mt-3 space-y-1">
              <div className="text-[10px] font-semibold text-white/30 uppercase">
                Outgoing edges
              </div>
              {EDGES.filter(e => e.from === activeNodeDef.id).map(e => (
                <div
                  key={e.id}
                  className="text-[11px] text-emerald-300/90 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-2 py-1"
                >
                  → {e.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
