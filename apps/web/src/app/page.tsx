'use client';

import { Scene3D } from "@/components/landing/Scene3D";
import { Activity, ShieldCheck, ArrowRight, Layers, Lock, Cpu, Bot } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import DataTradeFlow from "@/components/flow/DataTradeFlow";
import { FlowDiagram } from "@/components/flow/FlowDiagram";

export default function Home() {
  return (
    <div className="bg-black text-white min-h-screen font-sans selection:bg-emerald-500 selection:text-black flex flex-col">
      
      {/* ─── HERO SECTION ─────────────────────────────────────────────────── */}
      <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* 3D Background */}
        <div className="absolute inset-0 z-0">
          <Scene3D />
        </div>

        {/* Overlay Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col justify-between py-8 pointer-events-none">
          
          {/* Top Bar: Dashboard Metrics */}
          <div className="flex justify-between items-start pointer-events-auto">
             <div className="flex gap-8 text-xs font-mono tracking-wider">
                <div className="hidden md:block">
                   <div className="text-emerald-500/60 mb-1 uppercase">Verified Volume</div>
                   <div className="text-emerald-400 font-bold text-lg">On-chain <span className="text-[10px] text-emerald-500/40">indexed</span></div>
                </div>
                <div className="hidden md:block">
                   <div className="text-emerald-500/60 mb-1 uppercase">Active Programs</div>
                   <div className="text-white font-bold text-lg">Live</div>
                </div>
                <div className="hidden md:block">
                   <div className="text-emerald-500/60 mb-1 uppercase">Settlement Time</div>
                   <div className="text-white font-bold text-lg">~2.4s</div>
                </div>
             </div>
             
             <div className="text-right">
                <div className="text-emerald-500/80 text-[10px] font-mono tracking-[0.3em] uppercase mb-1">
                  System Status: Online
                </div>
                <div className="flex items-center justify-end gap-2 text-xs text-emerald-400/60">
                   <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                   <span>Stellar Testnet Connected</span>
                </div>
             </div>
          </div>

          {/* Center Hero Text */}
          <div className="flex flex-col items-center text-center pointer-events-auto mt-[-6vh]">
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.8 }}
               className="mb-6"
             >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-6">
                   <span className="relative flex h-2 w-2">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                   </span>
                   PROTOCOL V1.0 LIVE
                </div>
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/50 mb-4">
                   Programmable<br/>Data Exchange
                </h1>
                <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-light">
                   Request verified data with ZK proofs. Provide data and earn USDC.<br/>
                   Privacy-preserving <span className="text-emerald-400">data economy on Stellar</span>.
                </p>
             </motion.div>

             <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.8, delay: 0.2 }}
               className="flex flex-col sm:flex-row gap-4 w-full justify-center"
             >
                {/* Primary CTA — Agent Console */}
                <Link href="/agent" className="group relative px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm tracking-wide uppercase transition-all">
                   <span className="flex items-center gap-2">
                      <Bot size={16} />
                      Open Agent Console
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                   </span>
                </Link>
                <Link href="/marketplace" className="group px-8 py-4 bg-black border border-white/20 hover:border-emerald-500/50 text-white font-bold text-sm tracking-wide uppercase transition-all">
                   <span className="flex items-center gap-2">
                      Browse Marketplace
                   </span>
                </Link>
                <Link href="/sell" className="group px-8 py-4 bg-black border border-cyan-400/30 hover:border-cyan-400/60 text-cyan-100 font-bold text-sm tracking-wide uppercase transition-all">
                   <span className="flex items-center gap-2">
                      Sell Data
                   </span>
                </Link>
             </motion.div>
          </div>

          {/* Bottom Area: Feature Tickers — pushed down with mt-auto + extra pt */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pointer-events-auto border-t border-white/10 pt-8 pb-2 mt-auto">
             <FeatureItem 
                icon={ShieldCheck} 
                title="ZK-TLS Proof of Origin" 
                desc="Reclaim Protocol verifies data came from the real API — without exposing raw content." 
             />
             <FeatureItem 
                icon={Layers} 
                title="Stellar Escrow Settlement" 
                desc="USDC locked in Soroban smart contract. Atomic 3-way release: 70% provider, 20% platform, 10% dispute." 
             />
             <FeatureItem 
                icon={Cpu} 
                title="Consent-Based Data Programs" 
                desc="Providers grant consent on-chain. OpenClaw bot automates proof generation and delivery." 
             />
          </div>

        </div>
      </section>

      {/* ─── HOW IT WORKS / DATA TRADE FLOW ──────────────────────────────── */}
      <section className="py-24 bg-black border-t border-white/10 relative">
         <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-10">
               <p className="text-slate-400 text-sm max-w-xl mx-auto">
                  End-to-end flow of a buy-data program on Stellar — from policy and consent to ZK proof and escrow release.
               </p>
            </div>

            <FlowDiagram />

            <div className="mt-16">
               <DataTradeFlow />
            </div>

            {/* Explanation Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
               <div>
                  <h3 className="text-2xl md:text-3xl font-bold mb-6">
                     Privacy-First.<br/>
                     <span className="text-emerald-500">Zero Raw Data Exposure.</span>
                  </h3>
                  <p className="text-slate-400 mb-8 text-lg leading-relaxed">
                     The platform never sees your raw data. Reclaim Protocol&apos;s ZK-TLS creates cryptographic proof that data came from a real API (Fitbit, Strava, Plaid...) without revealing the actual content.
                  </p>
                  
                  <div className="space-y-6">
                     <ComparisonRow 
                        good={true} 
                        title="ZK-TLS Proof of Origin" 
                        desc="Cryptographic proof that data came from the real source API — timestamp verified." 
                     />
                     <ComparisonRow 
                        good={true} 
                        title="On-Chain Consent" 
                        desc="Providers explicitly grant consent on Stellar. No program execution without permission." 
                     />
                     <ComparisonRow 
                        good={true} 
                        title="Atomic Escrow Settlement" 
                        desc="Soroban smart contract releases USDC: 70% provider, 20% platform, 10% dispute pool — all in one TX." 
                     />
                  </div>
               </div>

               <div>
                  <h3 className="text-2xl md:text-3xl font-bold mb-6">
                     For <span className="text-cyan-400">Providers</span> &amp; <span className="text-emerald-400">Requesters</span>
                  </h3>
                  
                  <div className="space-y-4">
                     <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                        <h4 className="font-bold text-emerald-400 text-sm mb-2 uppercase tracking-wide">Data Buyer</h4>
                        <p className="text-slate-400 text-sm leading-relaxed">
                           Define what data you need — source, metrics, duration, budget. Pick a verified MCP standard from the marketplace or create your own. USDC is locked in escrow until proof arrives.
                        </p>
                     </div>
                     <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                        <h4 className="font-bold text-cyan-400 text-sm mb-2 uppercase tracking-wide">Data Seller</h4>
                        <p className="text-slate-400 text-sm leading-relaxed">
                           Connect your OpenClaw bot, select supported data sources, and accept buy-data tasks. Your bot listens for consent events on Stellar, fetches data via API, generates ZK proofs, and submits — earning USDC automatically.
                        </p>
                     </div>
                     <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                        <h4 className="font-bold text-amber-400 text-sm mb-2 uppercase tracking-wide">MCP Creator</h4>
                        <p className="text-slate-400 text-sm leading-relaxed">
                           Publish data extraction standards to the marketplace. When someone uses your standard, you earn a usage fee per execution — tracked transparently on-chain.
                        </p>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

    </div>
  );
}

// ─── SUBCOMPONENTS ───────────────────────────────────────────────────────────

type Tone = "emerald" | "cyan" | "amber" | "purple" | "blue";

const toneClasses: Record<Tone, { frame: string; icon: string; trail: string }> = {
   emerald: {
      frame: "border-emerald-500/70 bg-emerald-500/10",
      icon: "text-emerald-400",
      trail: "via-emerald-500",
   },
   cyan: {
      frame: "border-cyan-500/70 bg-cyan-500/10",
      icon: "text-cyan-400",
      trail: "via-cyan-500",
   },
   amber: {
      frame: "border-amber-500/70 bg-amber-500/10",
      icon: "text-amber-400",
      trail: "via-amber-500",
   },
   purple: {
      frame: "border-purple-500/70 bg-purple-500/10",
      icon: "text-purple-400",
      trail: "via-purple-500",
   },
   blue: {
      frame: "border-blue-500/70 bg-blue-500/10",
      icon: "text-blue-400",
      trail: "via-blue-500",
   },
};

function FlowActor({
   icon,
   title,
   subtitle,
   tone,
   diamond = false,
}: {
   icon: ReactNode;
   title: string;
   subtitle: string;
   tone: Tone;
   diamond?: boolean;
}) {
   const cls = toneClasses[tone];
   return (
      <div className="flex min-w-[86px] flex-col items-center gap-3 text-center">
         <div
            className={[
               "flex h-14 w-14 items-center justify-center border shadow-[0_0_24px_rgba(15,23,42,0.45)]",
               diamond ? "rounded-xl rotate-45" : "rounded-full",
               cls.frame,
            ].join(" ")}
         >
            <div className={[cls.icon, diamond ? "-rotate-45" : ""].join(" ")}>{icon}</div>
         </div>
         <div>
            <div className="text-sm font-bold text-white">{title}</div>
            <div className="text-xs text-slate-500">{subtitle}</div>
         </div>
      </div>
   );
}

function FlowConnector({ tone, delay = 0 }: { tone: Tone; delay?: number }) {
   const cls = toneClasses[tone];
   return (
      <div className="relative h-[2px] w-8 md:w-10 bg-white/10">
         <motion.div
            animate={{ x: ["0%", "100%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear", delay }}
            className={`absolute top-1/2 -translate-y-1/2 h-1 w-8 bg-gradient-to-r from-transparent ${cls.trail} to-transparent`}
         />
      </div>
   );
}

function FeatureItem({
   icon: Icon,
   title,
   desc,
}: {
   icon: LucideIcon;
   title: string;
   desc: string;
}) {
   return (
      <div className="flex gap-4 items-start group">
         <div className="p-3 rounded bg-white/5 border border-white/10 group-hover:border-emerald-500/50 transition-colors">
            <Icon size={20} className="text-emerald-400" />
         </div>
         <div>
            <h3 className="font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">{title}</h3>
            <p className="text-sm text-slate-400 leading-snug">{desc}</p>
         </div>
      </div>
   );
}

function ComparisonRow({
   good,
   title,
   desc,
}: {
   good: boolean;
   title: string;
   desc: string;
}) {
   return (
      <div className="flex gap-4">
         <div className="mt-1">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${good ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
               {good ? <ShieldCheck size={12} /> : <div className="w-2 h-2 bg-current rounded-full" />}
            </div>
         </div>
         <div>
            <h4 className="font-bold text-white text-sm">{title}</h4>
            <p className="text-sm text-slate-400">{desc}</p>
         </div>
      </div>
   );
}

function DatabaseIcon() {
   return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
         <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
         <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
         <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
      </svg>
   );
}
