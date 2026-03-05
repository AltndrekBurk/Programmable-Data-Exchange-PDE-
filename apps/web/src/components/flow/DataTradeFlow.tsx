import React, { useState } from "react";
import { Shield, Database, Send, CheckCircle, Wallet, Lock } from "lucide-react";

const DataTradeFlow = () => {
  const [step, setStep] = useState(1);

  const steps = [
    {
      id: 1,
      label: "Skill / MCP Setup",
      icon: <Database size={20} />,
      desc: "Buyer defines the data request or selects a marketplace MCP; skill JSON is pinned to IPFS.",
    },
    {
      id: 2,
      label: "USDC Escrow Lock",
      icon: <Wallet size={20} />,
      desc: "USDC is locked into the Soroban escrow contract on Stellar testnet for this program.",
    },
    {
      id: 3,
      label: "Provider Consent",
      icon: <Shield size={20} />,
      desc: "Platform routes the task to providers; a seller accepts and a consent TX is written on Stellar.",
    },
    {
      id: 4,
      label: "Proof Generation",
      icon: <Lock size={20} />,
      desc: "OpenClaw listens for consent, fetches API data and generates a Reclaim zkTLS proof of origin.",
    },
    {
      id: 5,
      label: "Settlement & Delivery",
      icon: <CheckCircle size={20} />,
      desc: "Platform verifies the proof, triggers X402 + escrow release (70/20/10) and delivers encrypted payload.",
    },
  ];

  const handleNextStep = () => {
    if (step < steps.length) setStep((s) => s + 1);
  };

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-6 md:p-8 shadow-2xl">
      <h3 className="text-xl md:text-2xl font-bold mb-6 text-emerald-400">
        Data Trade Execution Flow
      </h3>

      <div className="flex justify-between mb-8 relative">
        <div className="absolute top-5 left-0 w-full h-[2px] bg-slate-800 -z-10" />
        {steps.map((s) => (
          <div key={s.id} className="flex flex-col items-center w-1/5 text-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all 
                ${step >= s.id ? "bg-emerald-400 border-emerald-400 text-black" : "bg-slate-900 border-slate-600 text-slate-400"}`}
            >
              {step > s.id ? <CheckCircle size={20} /> : s.icon}
            </div>
            <p
              className={`mt-2 text-[11px] font-semibold uppercase tracking-wide ${
                step >= s.id ? "text-emerald-300" : "text-slate-500"
              }`}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-black/40 p-5 rounded-xl border border-slate-700">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
            {steps[step - 1].icon}
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-bold">{steps[step - 1].label}</h4>
            <p className="text-slate-400 mt-1 text-sm">{steps[step - 1].desc}</p>

            <div className="mt-5 p-4 bg-black/60 rounded-lg border border-slate-700 font-mono text-[11px] text-emerald-300 space-y-1">
              <div>{`> Initializing ${steps[step - 1].label}...`}</div>
              {step === 2 && <div>{"> Locking USDC into Soroban escrow for this program..."}</div>}
              {step === 3 && <div>{"> Waiting for Stellar consent transaction from provider..."}</div>}
              {step === 4 && <div>{"> Verifying Reclaim zkTLS proof and timestamp via attestor-core..."}</div>}
              {step === 5 && <div>{"> X402 + Soroban: executing 70/20/10 USDC release and delivering payload..."}</div>}
              <div>{"> Waiting for ledger response..."}</div>
            </div>

            <button
              onClick={handleNextStep}
              disabled={step === steps.length}
              className="mt-5 px-6 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-black font-bold rounded-lg flex items-center gap-2 text-sm transition-colors"
            >
              {step === steps.length ? "Flow Completed" : "Execute Next Step"}
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataTradeFlow;

