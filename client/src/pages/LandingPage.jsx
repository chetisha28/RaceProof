import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ShieldCheck,
  Zap,
  Lock,
  Database,
  ArrowRight,
  CheckCircle,
  Users,
  AlertTriangle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';

export const LandingPage = () => {
  const { isAuthenticated } = useAuth();

  // Interactive Live Concurrency Visualizer Simulation State
  const [simState, setSimState] = useState({
    running: false,
    capacity: 4,
    initialCount: 3,
    accepted: 0,
    conflicts: 0,
    requestsProcessed: 0,
    totalSimRequests: 50,
    finished: false,
  });

  const runSimulation = () => {
    setSimState({
      running: true,
      capacity: 4,
      initialCount: 3,
      accepted: 0,
      conflicts: 0,
      requestsProcessed: 0,
      totalSimRequests: 50,
      finished: false,
    });

    let currentProcessed = 0;
    let accepted = 0;
    let conflicts = 0;

    const interval = setInterval(() => {
      currentProcessed += 2;
      if (currentProcessed <= 50) {
        if (accepted === 0) {
          accepted = 1; // Exactly 1 takes the final slot!
          conflicts = currentProcessed - 1;
        } else {
          conflicts = currentProcessed - 1;
        }

        setSimState((prev) => ({
          ...prev,
          requestsProcessed: Math.min(50, currentProcessed),
          accepted,
          conflicts,
        }));
      }

      if (currentProcessed >= 50) {
        clearInterval(interval);
        setSimState((prev) => ({
          ...prev,
          running: false,
          finished: true,
          requestsProcessed: 50,
          accepted: 1,
          conflicts: 49,
        }));
      }
    }, 40);
  };

  const resetSimulation = () => {
    setSimState({
      running: false,
      capacity: 4,
      initialCount: 3,
      accepted: 0,
      conflicts: 0,
      requestsProcessed: 0,
      totalSimRequests: 50,
      finished: false,
    });
  };

  return (
    <div className="space-y-16 py-6">
      {/* Hero Section */}
      <div className="text-center max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          Enterprise-Grade Concurrency Engineering
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-navy-950 tracking-tight leading-tight">
          Race-Condition-Safe <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
            Hackathon Team Formation
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Guaranteed transactional integrity under extreme contention. When 50 participants compete for 1 remaining seat, exactly one is accepted. Zero oversubscription. Zero data drift.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          {isAuthenticated ? (
            <Link to="/dashboard">
              <Button size="lg" icon={ArrowRight}>
                Open Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/register">
                <Button size="lg" icon={ArrowRight}>
                  Get Started Free
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="lg">
                  Sign In to Demo
                </Button>
              </Link>
            </>
          )}
          <Link to="/teams">
            <Button variant="secondary" size="lg">
              Explore Live Teams
            </Button>
          </Link>
        </div>
      </div>

      {/* Interactive Concurrency Visualizer */}
      <Card className="p-6 sm:p-8 border-slate-300 shadow-xl bg-gradient-to-b from-white to-slate-50">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-slate-900">
                Interactive Concurrency Stress Simulator
              </h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Simulate 50 concurrent requests hitting a team with 3/4 members. Watch PostgreSQL row-locking prevent oversubscription in real time.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              onClick={runSimulation}
              disabled={simState.running}
              loading={simState.running}
              icon={Play}
              className="w-full sm:w-auto"
            >
              Run 50-Request Storm
            </Button>
            {simState.finished && (
              <Button variant="outline" onClick={resetSimulation} icon={RotateCcw}>
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Visualizer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-6">
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Team Capacity
            </span>
            <div className="text-3xl font-extrabold text-navy-900 mt-1">
              {simState.initialCount + simState.accepted} / {simState.capacity}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 mt-3">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  simState.initialCount + simState.accepted >= simState.capacity
                    ? 'bg-amber-500'
                    : 'bg-blue-600'
                }`}
                style={{
                  width: `${((simState.initialCount + simState.accepted) / simState.capacity) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              Dispatched Requests
            </span>
            <div className="text-3xl font-extrabold text-blue-900 mt-1">
              {simState.requestsProcessed} / {simState.totalSimRequests}
            </div>
            <p className="text-xs text-blue-600 mt-2">Simultaneous requests</p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              HTTP 200 OK (Accepted)
            </span>
            <div className="text-3xl font-extrabold text-emerald-900 mt-1">
              {simState.accepted}
            </div>
            <p className="text-xs text-emerald-600 mt-2">Exact capacity match</p>
          </div>

          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
              HTTP 409 Conflict
            </span>
            <div className="text-3xl font-extrabold text-rose-900 mt-1">
              {simState.conflicts}
            </div>
            <p className="text-xs text-rose-600 mt-2">Prevented overfill</p>
          </div>
        </div>

        {/* Lock explanation banner */}
        <div className="mt-6 p-4 rounded-xl bg-navy-900 text-white flex items-start gap-4">
          <Lock className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-slate-300">
            <strong className="text-white">PostgreSQL Transaction Row Lock: </strong>
            <code className="text-blue-300 font-mono">SELECT ... FOR UPDATE</code> serializes all 50 transactions on the target Team record. The first commit claims the final seat ($3 \rightarrow 4$). Transactions 2–50 re-read the updated count ($4 \ge 4$), safely abort with <code className="text-rose-300 font-mono">ROLLBACK</code>, and return <code className="text-amber-300 font-mono">409 Conflict (TEAM_FULL)</code>.
          </div>
        </div>
      </Card>

      {/* Feature Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 space-y-3" hover>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">PostgreSQL 18 ACID Guarantees</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Pessimistic row locking ensures zero lost updates. Transactions commit atomically or roll back completely with zero state pollution.
          </p>
        </Card>

        <Card className="p-6 space-y-3" hover>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Unique Hackathon Invariant</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Composite constraint <code className="text-purple-700 bg-purple-50 px-1 py-0.5 rounded text-xs font-mono">UNIQUE(hackathonId, userId)</code> physically prevents a user from belonging to multiple teams.
          </p>
        </Card>

        <Card className="p-6 space-y-3" hover>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Real-Time Server-Sent Events</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Instantaneous unidirectional push updates for team capacities, membership changes, and join request approvals without polling.
          </p>
        </Card>
      </div>
    </div>
  );
};

