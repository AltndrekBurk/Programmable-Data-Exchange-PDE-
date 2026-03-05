import { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-12">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-100">dataEconomy</h1>
          <p className="mt-2 text-sm text-slate-400">
            Buy Data and Sell Data on Stellar
          </p>
        </div>
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flow-surface rounded-xl py-8 px-6 sm:px-10">
          {children}
        </div>
      </div>
    </div>
  );
}
