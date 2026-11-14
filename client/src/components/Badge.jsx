import React from 'react';

const statusStyles = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
  FULL: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
  DISBANDED: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20',
  PENDING: 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
  DECLINED: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/20',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200 ring-slate-500/20',
  LEADER: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20',
  MEMBER: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20',
};

export const Badge = ({ children, variant = 'ACTIVE', size = 'sm', className = '' }) => {
  const style = statusStyles[variant] || 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/20';
  const sizeClasses = size === 'xs' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ring-1 ring-inset uppercase tracking-wider ${sizeClasses} ${style} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
      {children || variant}
    </span>
  );
};

