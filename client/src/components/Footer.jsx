import React from 'react';
import { ShieldCheck, Cpu, Database, GitBranch } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-semibold text-slate-800">
              RaceProof <span className="text-slate-400 font-normal">v1.0.0</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-500">
              Race-Condition-Safe Team Formation Architecture
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              PostgreSQL 18 Row Locks
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              SELECT ... FOR UPDATE
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-slate-400" />
              ACID Verified
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Built for Hackathon Engineering Challenge
          </p>
        </div>
      </div>
    </footer>
  );
};

