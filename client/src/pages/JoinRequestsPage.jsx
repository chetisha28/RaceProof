import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { requestsAPI, teamsAPI } from '../services/api.js';
import { useSSE } from '../hooks/useSSE.js';
import {
  Inbox,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Users,
  Compass,
} from 'lucide-react';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

export const JoinRequestsPage = () => {
  const { user, refreshUser } = useAuth();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState('incoming'); // 'incoming' | 'outgoing'
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Teams that this user leads
  const ledTeams = user?.memberships
    ?.filter((m) => m.role === 'LEADER')
    ?.map((m) => m.team) || [];

  const fetchRequests = useCallback(async () => {
    try {
      // 1. Fetch outgoing requests
      const outRes = await requestsAPI.getMyRequests();
      setOutgoingRequests(outRes.data.data || []);

      // 2. Fetch incoming requests for teams led
      const incomingList = [];
      for (const team of ledTeams) {
        try {
          const incRes = await teamsAPI.getById(team.id);
          const pending = incRes.data.data?.pendingRequests || [];
          incomingList.push(...pending.map((p) => ({ ...p, team })));
        } catch (e) {}
      }
      setIncomingRequests(incomingList);
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  }, [ledTeams]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Connect SSE to reload requests on domain events
  useSSE(
    useCallback(() => {
      fetchRequests();
      refreshUser();
    }, [fetchRequests, refreshUser])
  );

  const handleAccept = async (requestId) => {
    try {
      await requestsAPI.accept(requestId);
      success('Join request accepted! Participant added to team.');
      fetchRequests();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to accept request.');
    }
  };

  const handleDecline = async (requestId) => {
    try {
      await requestsAPI.decline(requestId);
      success('Join request declined.');
      fetchRequests();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to decline request.');
    }
  };

  const handleCancel = async (requestId) => {
    try {
      await requestsAPI.cancel(requestId);
      success('Join request cancelled.');
      fetchRequests();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to cancel request.');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading join requests..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
          Join Request Center
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review incoming applicant requests for teams you lead, or track the status of your outgoing requests
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('incoming')}
          className={`flex items-center gap-2 pb-3 px-1 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'incoming'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Incoming Applications ({incomingRequests.length})
        </button>

        <button
          onClick={() => setActiveTab('outgoing')}
          className={`flex items-center gap-2 pb-3 px-1 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'outgoing'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Send className="w-4 h-4" />
          My Outgoing Requests ({outgoingRequests.length})
        </button>
      </div>

      {/* Incoming Requests Tab */}
      {activeTab === 'incoming' && (
        <div className="space-y-4">
          {ledTeams.length === 0 ? (
            <EmptyState
              icon={Users}
              title="You are not leading any teams"
              description="Only team leaders receive incoming join requests. Create a team to recruit collaborators."
              action={
                <Link to="/teams/create">
                  <Button size="sm">Create Team</Button>
                </Link>
              }
            />
          ) : incomingRequests.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No pending incoming applications"
              description="When other participants request to join teams you lead, they will appear here for your review."
            />
          ) : (
            incomingRequests.map((req) => (
              <Card key={req.id} className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{req.user?.name}</span>
                      <span className="text-xs text-slate-400">({req.user?.email})</span>
                      <span className="text-xs text-slate-300">&bull;</span>
                      <span className="text-xs font-semibold text-blue-600">
                        Applying to "{req.team?.name}"
                      </span>
                    </div>

                    {req.message && (
                      <p className="text-xs text-slate-600 italic py-1">"{req.message}"</p>
                    )}

                    <div className="flex flex-wrap gap-1 pt-1">
                      {req.user?.skills?.map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={XCircle}
                      onClick={() => handleDecline(req.id)}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      icon={CheckCircle2}
                      onClick={() => handleAccept(req.id)}
                    >
                      Accept Application
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Outgoing Requests Tab */}
      {activeTab === 'outgoing' && (
        <div className="space-y-4">
          {outgoingRequests.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No outgoing requests sent yet"
              description="Browse the team catalog to find teams looking for your skills and submit a join request."
              action={
                <Link to="/teams">
                  <Button size="sm">Explore Open Teams</Button>
                </Link>
              }
            />
          ) : (
            outgoingRequests.map((req) => (
              <Card key={req.id} className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/teams/${req.teamId}`}
                        className="font-bold text-sm text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {req.team?.name}
                      </Link>
                      <Badge variant={req.status} size="xs" />
                    </div>

                    <p className="text-xs text-slate-500">
                      Hackathon: {req.team?.hackathon?.name || 'Active Sprint'} &bull; Leader:{' '}
                      {req.team?.leader?.name}
                    </p>

                    {req.message && (
                      <p className="text-xs text-slate-600 italic py-0.5">
                        Your message: "{req.message}"
                      </p>
                    )}

                    <div className="text-[11px] text-slate-400">
                      Submitted on {new Date(req.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {req.status === 'PENDING' && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleCancel(req.id)}
                    >
                      Cancel Request
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};

