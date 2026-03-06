'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Activity, ShieldCheck } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Point3D = { x: number; y: number; z: number };
type Point2D = { x: number; y: number; scale: number };

interface BinaryParticle {
  char: string;
  speed: number;
  progress: number;
  laneIndex: number;
  color: string;
}

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseOpacity: number;
  size: number;
  twinkle: number;
  twinkleSpeed: number;
}

// ─── SCENE CONSTANTS ─────────────────────────────────────────────────────────
const CAMERA_Z = 900;
const MARGIN = 50;
const MATRIX_COLORS = [
  '#00FF41', '#00DD33', '#00B029', '#00801E', '#005012', '#00300B', '#001505'
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const rotateY = (p: Point3D, a: number): Point3D => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.z * s, y: p.y, z: p.x * s + p.z * c };
};

const project = (p: Point3D, width: number, height: number): Point2D => {
  const denom = CAMERA_Z - p.z;
  if (denom <= 0.01) return { x: width / 2, y: height / 2, scale: 0 };
  const scale = CAMERA_Z / denom;
  return { x: width / 2 + p.x * scale, y: height / 2 + p.y * scale, scale };
};

const bezier = (p0: Point3D, p1: Point3D, p2: Point3D, t: number): Point3D => ({
  x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x,
  y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y,
  z: (1-t)*(1-t)*p0.z + 2*(1-t)*t*p1.z + t*t*p2.z,
});

export function Scene3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Panels represent detailed views of the ecosystem
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);  // Active Programs
  const [rightPanelOpen, setRightPanelOpen] = useState(false); // Network Stats

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ─── State Initialization ────────────────────────────────────────────────
    let stars: Star[] = [];
    let shootingStars: { x: number; y: number; vx: number; vy: number; length: number; opacity: number }[] = [];
    let binaryParticles: BinaryParticle[] = [];
    
    let frameId: number;
    let width = 0;
    let height = 0;
    let mouse = { x: -9999, y: -9999 };
    
    let currentRotationY = 0;
    let targetRotationY = 0;
    let particleOpacity = 1;
    let hoveredFace: number | null = null;

    // Cube dimensions
    let cubeHD = 0;
    let cubeW = 0;
    let cubeH = 0;

    let localVertices: Point3D[] = [];
    let edges: number[][] = [];

    // Faces: 0:FRONT (Programs), 1:RIGHT (Stats), 2:BACK (System), 3:LEFT (Logs)
    // We remap colors to fit the "Data Exchange" theme
    // Front: Emerald (Programs), Right: Purple (Stats), Back: Slate (System), Left: Cyan (Logs)
    const faces = [
      { id: 0, name: 'PROGRAMS', indices: [0, 1, 2, 3], color: '#10B981' }, // Emerald
      { id: 1, name: 'STATS', indices: [1, 5, 6, 2], color: '#A855F7' }, // Purple
      { id: 2, name: 'SYSTEM', indices: [5, 4, 7, 6], color: '#64748B' }, // Slate
      { id: 3, name: 'LOGS', indices: [4, 0, 3, 7], color: '#06B6D4' }, // Cyan
    ];

    const updateGeometry = () => {
      const halfW = (width / 2) - MARGIN;
      const halfH = (height / 2) - MARGIN;
      const hd = halfW * CAMERA_Z / (CAMERA_Z + halfW);
      
      cubeHD = hd;
      cubeW = hd;
      cubeH = halfH * (CAMERA_Z - hd) / CAMERA_Z;

      const w = cubeW, h = cubeH;
      localVertices = [
        { x: -w, y: -h, z: +hd }, { x:  w, y: -h, z: +hd },
        { x:  w, y:  h, z: +hd }, { x: -w, y:  h, z: +hd },
        { x: -w, y: -h, z: -hd }, { x:  w, y: -h, z: -hd },
        { x:  w, y:  h, z: -hd }, { x: -w, y:  h, z: -hd },
      ];
      edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7],
      ];
    };

    const initStars = () => {
      stars = Array.from({ length: 52 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        baseOpacity: Math.random() * 0.30 + 0.08,
        size: Math.random() * 1.1 + 0.25,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.007 + Math.random() * 0.014,
      }));
    };

    // ─── RENDER LOOP ─────────────────────────────────────────────────────────
    const render = () => {
      const diff = targetRotationY - currentRotationY;
      currentRotationY += diff * 0.05;

      if (Math.abs(diff) > 0.018) {
        particleOpacity += (0 - particleOpacity) * 0.13;
      } else {
        particleOpacity += (1 - particleOpacity) * 0.07;
      }

      const tv = localVertices.map(v => rotateY(v, currentRotationY));
      const pv = tv.map(v => project(v, width, height));

      ctx.clearRect(0, 0, width, height);
      // Background gradient for depth
      const grad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width);
      grad.addColorStop(0, '#0a0a0a');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 1. Stars
      ctx.fillStyle = '#ffffff';
      for (const star of stars) {
        star.twinkle += star.twinkleSpeed;
        const opacity = star.baseOpacity * (0.55 + 0.45 * Math.sin(star.twinkle));
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.beginPath();
        ctx.arc(star.x, star.y, Math.max(0.15, star.size), 0, Math.PI * 2);
        ctx.fill();
        star.x += star.vx; star.y += star.vy;
        if (star.x < -2) star.x = width + 2;
        if (star.x > width + 2) star.x = -2;
        if (star.y < -2) star.y = height + 2;
        if (star.y > height + 2) star.y = -2;
      }
      ctx.globalAlpha = 1;

      // 2. Shooting Stars (Data Packets visual metaphor)
      if (Math.random() < 0.01) {
        shootingStars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (3 + Math.random() * 5) * (Math.random() > 0.5 ? 1 : -1),
          vy: (Math.random() - 0.5) * 1,
          length: 20 + Math.random() * 40,
          opacity: 0.7 + Math.random() * 0.3,
        });
      }
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        ss.x += ss.vx; ss.y += ss.vy;
        ss.opacity -= 0.02;
        if (ss.opacity <= 0) { shootingStars.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.strokeStyle = `rgba(16, 185, 129, ${ss.opacity * 0.5})`; // Emerald tint
        ctx.lineWidth = 1.5;
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - ss.vx * ss.length * 0.1, ss.y - ss.vy * ss.length * 0.1);
        ctx.stroke();
      }

      // 3. Cube Faces
      const sortedFaces = faces
        .map(f => ({ face: f, avgZ: f.indices.reduce((s, i) => s + tv[i].z, 0) / 4 }))
        .sort((a, b) => a.avgZ - b.avgZ);

      sortedFaces.forEach(({ face, avgZ }) => {
        const isHovered = hoveredFace === face.id;
        const verts = face.indices.map(i => pv[i]);
        
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let j = 1; j < 4; j++) ctx.lineTo(verts[j].x, verts[j].y);
        ctx.closePath();

        if (isHovered && face.id !== 0) { // Don't highlight front face as clickable if it's default view
            ctx.fillStyle = face.color + '22'; // 22 hex alpha ~13%
            ctx.shadowColor = face.color;
            ctx.shadowBlur = 30;
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            const zNorm = Math.max(0, Math.min(1, (avgZ + cubeHD) / (2 * cubeHD)));
            const alpha = face.id === 0 ? 0.02 : (0.01 + zNorm * 0.02);
            ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`; // Unified emerald base for structure
            ctx.fill();
        }
      });

      // 4. Edges (Data Lines)
      const timePhase = (Date.now() % 3000) / 3000;
      edges.forEach((edge) => {
        const p1 = pv[edge[0]];
        const p2 = pv[edge[1]];
        
        // Base structure lines
        ctx.strokeStyle = `rgba(16, 185, 129, 0.15)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Animated data pulse on edges
        const segmentLen = 0.3;
        const start = (timePhase * (1 + segmentLen)) - segmentLen;
        const end = start + segmentLen;
        
        const sSafe = Math.max(0, Math.min(1, start));
        const eSafe = Math.max(0, Math.min(1, end));
        
        if (sSafe !== eSafe) {
            const sp = { x: p1.x + (p2.x - p1.x) * sSafe, y: p1.y + (p2.y - p1.y) * sSafe };
            const ep = { x: p1.x + (p2.x - p1.x) * eSafe, y: p1.y + (p2.y - p1.y) * eSafe };
            
            ctx.strokeStyle = `rgba(16, 185, 129, ${0.8 * particleOpacity})`;
            ctx.lineWidth = 2;
            ctx.shadowColor = '#10B981';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(sp.x, sp.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
      });

      // 5. Binary Data Flow (The "Flow" in Data Flow)
      const w = cubeW, h = cubeH, hd = cubeHD;
      const startP = { x: -w, y: h, z: -hd };
      const endP = { x: w, y: -h, z: +hd };
      const ctrlP = { x: 0, y: -h * 2, z: 0 }; // Control point for curve

      if (Math.random() < 0.25) {
        const lane = Math.floor(Math.random() * 5); // 5 lanes
        const chars = ['1', '0', '10', '01', '11', '00'];
        binaryParticles.push({
          char: chars[Math.floor(Math.random() * chars.length)],
          speed: 0.002 + Math.random() * 0.003,
          progress: 0,
          laneIndex: lane,
          color: MATRIX_COLORS[Math.floor(Math.random() * MATRIX_COLORS.length)],
        });
      }

      if (particleOpacity > 0.01) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let i = binaryParticles.length - 1; i >= 0; i--) {
            const p = binaryParticles[i];
            p.progress += p.speed;
            if (p.progress >= 1) { binaryParticles.splice(i, 1); continue; }

            // Curve math
            const spread = 60;
            const off = (p.laneIndex - 2) * spread;
            const lS = { x: startP.x + off, y: startP.y, z: startP.z };
            const lE = { x: endP.x + off, y: endP.y, z: endP.z };
            const lC = { x: ctrlP.x + off, y: ctrlP.y, z: ctrlP.z };

            const pos = bezier(lS, lC, lE, p.progress);
            const rotated = rotateY(pos, currentRotationY);
            const proj = project(rotated, width, height);
            
            if (proj.scale <= 0) continue;

            const fontSize = Math.max(8, 16 * proj.scale);
            ctx.font = `bold ${fontSize}px monospace`;
            ctx.globalAlpha = Math.max(0.1, particleOpacity);
            ctx.fillStyle = p.color;
            ctx.shadowColor = '#00FF41';
            ctx.shadowBlur = 5 * proj.scale;
            ctx.fillText(p.char, proj.x, proj.y);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
          }
      }

      // 6. Hit Test
      hoveredFace = null;
      for (let i = sortedFaces.length - 1; i >= 0; i--) {
        const { face } = sortedFaces[i];
        const verts = face.indices.map(j => pv[j]);
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let j = 1; j < 4; j++) ctx.lineTo(verts[j].x, verts[j].y);
        ctx.closePath();
        if (ctx.isPointInPath(mouse.x, mouse.y)) {
          hoveredFace = face.id;
          break;
        }
      }
      document.body.style.cursor = hoveredFace !== null && hoveredFace !== 0 ? 'pointer' : 'default';

      frameId = requestAnimationFrame(render);
    };

    // ─── EVENTS ──────────────────────────────────────────────────────────────
    const handleResize = () => {
      if (containerRef.current && canvas) {
        width = containerRef.current.clientWidth;
        height = containerRef.current.clientHeight;
        canvas.width = width;
        canvas.height = height;
        updateGeometry();
        initStars();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleClick = () => {
      if (hoveredFace !== null) {
        let newTarget = 0;
        if (hoveredFace === 3) newTarget = -Math.PI / 2; // Left face (Logs)
        if (hoveredFace === 1) newTarget = Math.PI / 2;  // Right face (Stats)

        if (Math.abs(targetRotationY - newTarget) < 0.1) {
          targetRotationY = 0;
          setLeftPanelOpen(false);
          setRightPanelOpen(false);
        } else {
          targetRotationY = newTarget;
          setLeftPanelOpen(hoveredFace === 3);
          setRightPanelOpen(hoveredFace === 1);
        }
      } else {
        targetRotationY = 0;
        setLeftPanelOpen(false);
        setRightPanelOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    handleResize();
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black overflow-hidden z-0">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* ─── LEFT PANEL: ACTIVE PROGRAMS (Replaces Logs) ─────────────────── */}
      <SidePanel isOpen={leftPanelOpen} side="left" title="Active Programs" subtitle="LIVE TASK QUEUE" icon={Activity} color="cyan">
         <div className="space-y-4 font-mono text-xs">
            <FlowCard source="Buy Data Queue" type="Pending consent tasks" status="verified" value="live" />
            <FlowCard source="Sell Data Policy" type="Reward + witness constraints" status="verified" value="active" />
            <FlowCard source="Proof Channel" type="OpenClaw -> /api/proofs/submit" status="pending" value="monitor" />
            <FlowCard source="Delivery Route" type="HTTPS callback + x402 gate" status="verified" value="enforced" />
         </div>
      </SidePanel>

      {/* ─── RIGHT PANEL: NETWORK STATS (Replaces Power Grid) ────────────── */}
      <SidePanel isOpen={rightPanelOpen} side="right" title="Network State" subtitle="VERIFICATION SIGNALS" icon={Zap} color="purple">
         <div className="space-y-6 mt-2">
            <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded mt-4">
                <div className="text-purple-400 text-xs font-bold mb-2 uppercase">How To Read Live State</div>
                <div className="space-y-2 text-xs font-mono text-slate-300">
                    <p>- Program volume: loaded from Stellar `manage_data` index.</p>
                    <p>- Proof status: loaded from `/api/proofs/list`.</p>
                    <p>- Settlement records: loaded from `/api/escrow/list`.</p>
                    <p>- Real numbers are shown in Dashboard tables, not in this animation.</p>
                </div>
            </div>
         </div>
      </SidePanel>
    </div>
  );
}

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────

function SidePanel({ isOpen, side, title, subtitle, icon: Icon, color, children }: any) {
    const isLeft = side === 'left';
    const xOff = isLeft ? -420 : 420;
    const rotate = isLeft ? -8 : 8;
    const colorClass = color === 'cyan' ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/20' : 'text-purple-400 border-purple-500/30 bg-purple-500/20';
    const borderClass = color === 'cyan' ? 'border-cyan-400/30 shadow-[0_0_30px_rgba(6,182,212,0.1)]' : 'border-purple-400/30 shadow-[0_0_30px_rgba(168,85,247,0.1)]';

    return (
        <div className={`absolute ${side}-0 top-0 h-full flex items-center pointer-events-none`} style={{ perspective: '1000px' }}>
            <div className="relative h-[80%]">
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ x: xOff, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: xOff, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className={`absolute ${isLeft ? 'left-12' : 'right-12'} top-0 w-80 h-full pointer-events-auto`}
                            style={{ transformStyle: 'preserve-3d', transform: `rotateY(${rotate}deg)` }}
                        >
                            <div className={`relative w-full h-full bg-black/80 backdrop-blur-xl border ${borderClass} overflow-hidden flex flex-col`}>
                                <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
                                <div className="relative z-10 p-6 flex-1 overflow-y-auto">
                                    <div className={`flex items-center gap-3 mb-6 border-b border-white/10 pb-4`}>
                                        <div className={`w-10 h-10 rounded flex items-center justify-center border ${colorClass}`}>
                                            <Icon size={20} />
                                        </div>
                                        <div>
                                            <h3 className={`font-bold uppercase tracking-wider text-sm ${color === 'cyan' ? 'text-cyan-400' : 'text-purple-400'}`}>{title}</h3>
                                            <p className="text-slate-400 text-xs font-mono tracking-tighter">{subtitle}</p>
                                        </div>
                                    </div>
                                    {children}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function FlowCard({ source, type, status, value }: { source: string, type: string, status: string, value: string }) {
    const isVerified = status === 'verified';
    return (
        <div className="p-3 bg-white/5 border border-white/10 rounded hover:border-emerald-500/50 transition-colors group">
            <div className="flex justify-between items-start mb-2">
                <span className="text-emerald-400 font-bold">{source}</span>
                <span className="text-white text-xs bg-white/10 px-1.5 py-0.5 rounded">{value}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>{type}</span>
                <div className="flex items-center gap-1">
                    {isVerified ? <ShieldCheck size={12} className="text-emerald-500" /> : <Activity size={12} className="text-yellow-500" />}
                    <span className={isVerified ? "text-emerald-500" : "text-yellow-500"}>{status.toUpperCase()}</span>
                </div>
            </div>
        </div>
    );
}
