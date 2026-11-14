import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { hackathonsAPI, teamsAPI, requestsAPI } from '../services/api.js';
import { useSSE } from '../hooks/useSSE.js';
import {
  Trophy,
  Users,
  UserCheck,
  Inbox,
  ArrowRight,
  PlusCircle,
  Calendar,
  Activity,
  Compass,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

export const DashboardPage = () => {
  const { user, refreshUser } = useAuth();
  const [hackathons, setHackathons] = useState([]);
  const [teams, setTeams] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [hackRes, teamsRes, reqRes] = await Promise.all([
        hackathonsAPI.getAll(),
        teamsAPI.getAll({ limit: 10 }),
        requestsAPI.getMyRequests().catch(() => ({ data: { data: [] } })),
      ]);

      setHackathons(hackRes.data.data || []);
      setTeams(teamsRes.data.data || []);
      setMyRequests(reqRes.data.data || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Connect Real-Time Server-Sent Events to refresh dashboard when teams mutate
  useSSE(
    useCallback(
      (event) => {
        // Refetch whenever team creation, membership mutation or request changes occur
        fetchDashboardData();
        refreshUser();
      },
      [fetchDashboardData, refreshUser]
    )
  );

  if (loading) {
    return <LoadingSpinner text="Loading dashboard metrics..." />;
  }

  // Calculate high-level stats
  const totalTeams = teams.length;
  const availableSeats = teams.reduce((acc, t) => acc + (t.availableSeats || 0), 0);
  const myTeam = user?.memberships?.[0]?.team;
  const myRole = user?.memberships?.[0]?.role;
  const pendingRequestsCount = myRequests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-navy-900 via-navy-800 to-blue-900 text-white shadow-lg">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {user?.name}! 👋
          </h1>
          <p className="text-sm text-slate-300">
            {myTeam
              ? `You are in "${myTeam.name}" as ${myRole}. Team formation is active.`
              : 'You are not in a team yet. Discover open teams or create your own.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {!myTeam ? (
            <>
              <Link to="/teams">
                <Button variant="secondary" icon={Compass} size="sm">
                  Explore Teams
                </Button>
              </Link>
              <Link to="/teams/create">
                <Button icon={PlusCircle} size="sm">
                  Create Team
                </Button>
              </Link>
            </>
          ) : (
            <Link to={`/teams/${myTeam.id}`}>
              <Button icon={Users} size="sm">
                Manage My Team
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Hackathons
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{hackathons.length}</div>
            <span className="text-xs text-slate-400">Active contests</span>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Teams
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{totalTeams}</div>
            <span className="text-xs text-slate-400">Across all contests</span>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Available Seats
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{availableSeats}</div>
            <span className="text-xs text-slate-400">Open member slots</span>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              My Requests
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">{pendingRequestsCount}</div>
            <span className="text-xs text-slate-400">Pending review</span>
          </div>
        </Card>
      </div>

      {/* Main Grid: My Team Status & Active Hackathons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: My Current Team & Incoming/Outgoing Requests */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Team Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">My Team Status</h2>
              </div>
              {myTeam && <Badge variant={myTeam.status} />}
            </div>

            {myTeam ? (
              <div className="pt-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{myTeam.name}</h3>
                    <p className="text-xs text-slate-500">
                      Hackathon: {myTeam.hackathon?.name || 'Active Sprint'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={myRole}>{myRole}</Badge>
                    <Link to={`/teams/${myTeam.id}`}>
                      <Button variant="outline" size="sm" icon={ArrowRight}>
                        View Team Roster
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-medium text-slate-700">
                      Composite Constraint: Protected from double-booking
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    UNIQUE(hackathonId, userId)
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  You are not currently in a team for any active hackathon. You can browse teams looking for your skills or create a new team.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Link to="/teams">
                    <Button size="sm" icon={Compass}>
                      Explore Teams
                    </Button>
                  </Link>
                  <Link to="/teams/create">
                    <Button variant="outline" size="sm" icon={PlusCircle}>
                      Create Team
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </Card>

          {/* Active Teams Spotlight */}
          <Card className="p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Activity className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Featured Teams</h2>
              </div>
              <Link to="/teams" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                View All ({totalTeams}) &rarr;
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {teams.slice(0, 4).map((team) => (
                <div key={team.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/teams/${team.id}`}
                        className="font-semibold text-sm text-slate-900 hover:text-blue-600 transition-colors truncate"
                      >
                        {team.name}
                      </Link>
                      <Badge variant={team.status} size="xs" />
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1">{team.description}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>Leader: {team.leader?.name}</span>
                      <span>&bull;</span>
                      <span>
                        Capacity: {team.memberCount} / {team.maxSize} ({team.availableSeats} slots left)
                      </span>
                    </div>
                  </div>

                  <Link to={`/teams/${team.id}`}>
                    <Button variant="outline" size="sm">
                      Details
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Active Hackathons & Recent Activity */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">Available Hackathons</h2>
            </div>

            <div className="pt-4 space-y-4">
              {hackathons.map((h) => (
                <div key={h.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <h3 className="font-bold text-sm text-slate-900">{h.name}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{h.description}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {new Date(h.startDate).toLocaleDateString()} &ndash;{' '}
                      {new Date(h.endDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Concurrency Invariant Safeguard Card */}
          <Card className="p-6 bg-gradient-to-b from-blue-50/50 to-slate-50 border-blue-100">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              Concurrency Invariants Active
            </div>
            <ul className="text-xs text-slate-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">&check;</span>
                <span>Pessimistic row locking with <code>SELECT ... FOR UPDATE</code></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">&check;</span>
                <span>Atomic capacity verification on each accept transaction</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">&check;</span>
                <span>Single-team-per-hackathon hard composite unique index</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};

