import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { teamsAPI, requestsAPI } from '../services/api.js';
import { useSSE } from '../hooks/useSSE.js';
import {
  Users,
  Crown,
  UserCheck,
  UserX,
  Share2,
  Trash2,
  LogOut,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ArrowLeft,
  Shield,
  FileText,
} from 'lucide-react';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Modal } from '../components/Modal.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

export const TeamDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { success, error } = useToast();

  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);

  // Modals state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedNewLeader, setSelectedNewLeader] = useState('');
  const [transferring, setTransferring] = useState(false);

  const fetchTeamDetails = useCallback(async () => {
    try {
      const [teamRes, auditRes] = await Promise.all([
        teamsAPI.getById(id),
        teamsAPI.getAuditLogs(id).catch(() => ({ data: { data: [] } })),
      ]);

      setTeam(teamRes.data.data);
      setAuditLogs(auditRes.data.data || []);
    } catch (err) {
      error(err.response?.data?.message || 'Failed to load team details.');
    } finally {
      setLoading(false);
    }
  }, [id, error]);

  useEffect(() => {
    fetchTeamDetails();
  }, [fetchTeamDetails]);

  // Connect SSE for live team roster changes
  useSSE(
    useCallback(
      (event) => {
        if (event.data?.teamId === id) {
          fetchTeamDetails();
          refreshUser();
        }
      },
      [id, fetchTeamDetails, refreshUser]
    )
  );

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    try {
      const res = await teamsAPI.createInvite(id, 24);
      const token = res.data.data.token;
      const fullUrl = `${window.location.origin}/invites/${token}`;
      setInviteLink(fullUrl);
      setCopiedInvite(false);
      setInviteModalOpen(true);
    } catch (err) {
      error(err.response?.data?.message || 'Failed to generate invitation.');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedInvite(true);
    success('Invite link copied to clipboard!');
    setTimeout(() => setCopiedInvite(false), 3000);
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      await requestsAPI.accept(requestId);
      success('Join request accepted! New member added.');
      fetchTeamDetails();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to accept request.');
    }
  };

  const handleDeclineRequest = async (requestId) => {
    try {
      await requestsAPI.decline(requestId);
      success('Join request declined.');
      fetchTeamDetails();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to decline request.');
    }
  };

  const handleRemoveMember = async (targetUserId, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from the team?`)) return;

    try {
      await teamsAPI.removeMember(id, targetUserId);
      success(`${memberName} has been removed from the team.`);
      fetchTeamDetails();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to remove member.');
    }
  };

  const handleLeaveTeam = async () => {
    if (!window.confirm('Are you sure you want to leave this team?')) return;

    try {
      const res = await teamsAPI.leave(id);
      success(res.data.message || 'You have left the team.');
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      error(err.response?.data?.message || 'Failed to leave team.');
    }
  };

  const handleTransferLeadership = async (e) => {
    e.preventDefault();
    if (!selectedNewLeader) return;

    setTransferring(true);
    try {
      await teamsAPI.transferLeadership(id, selectedNewLeader);
      success('Leadership transferred successfully!');
      setTransferModalOpen(false);
      fetchTeamDetails();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to transfer leadership.');
    } finally {
      setTransferring(false);
    }
  };

  const handleDisbandTeam = async () => {
    if (
      !window.confirm(
        'WARNING: Are you sure you want to disband this team? All memberships will be dissolved.'
      )
    )
      return;

    try {
      await teamsAPI.disband(id);
      success('Team has been disbanded.');
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      error(err.response?.data?.message || 'Failed to disband team.');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading team roster and details..." />;
  }

  if (!team) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-bold text-slate-800">Team Not Found</h2>
        <Link to="/teams" className="text-blue-600 text-sm mt-2 inline-block">
          &larr; Back to Teams
        </Link>
      </div>
    );
  }

  const isLeader = team.isLeader;
  const isMember = team.isMember;
  const availableSlots = Math.max(0, team.maxSize - team.members.length);
  const isFull = availableSlots === 0;

  return (
    <div className="space-y-8">
      {/* Back button */}
      <button
        onClick={() => navigate('/teams')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Explore Teams
      </button>

      {/* Team Header Banner */}
      <Card className="p-6 sm:p-8 border-slate-200 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
                {team.name}
              </h1>
              <Badge variant={team.status} />
            </div>
            <p className="text-xs font-medium text-slate-500">
              Hackathon:{' '}
              <span className="text-slate-800 font-semibold">{team.hackathon?.name}</span>
            </p>
          </div>

          {/* Action Buttons for Leader vs Member */}
          <div className="flex flex-wrap items-center gap-2.5">
            {isLeader && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Share2}
                  disabled={isFull}
                  loading={generatingInvite}
                  onClick={handleGenerateInvite}
                >
                  Generate Invite Link
                </Button>
                {team.members.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Crown}
                    onClick={() => setTransferModalOpen(true)}
                  >
                    Transfer Lead
                  </Button>
                )}
                <Button variant="danger" size="sm" icon={Trash2} onClick={handleDisbandTeam}>
                  Disband Team
                </Button>
              </>
            )}

            {isMember && !isLeader && (
              <Button variant="danger" size="sm" icon={LogOut} onClick={handleLeaveTeam}>
                Leave Team
              </Button>
            )}
          </div>
        </div>

        {/* Description & Capacity Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Project Vision & Scope
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">{team.description}</p>
            </div>

            {/* Invariant badge */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-950">
                <strong>ACID Invariant Enforced:</strong> Team membership is locked with{' '}
                <code className="text-blue-700 font-mono">SELECT ... FOR UPDATE</code>.
                Acceptance requests are queued and evaluated sequentially to prevent overfilling.
              </div>
            </div>
          </div>

          {/* Capacity Card */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Capacity Status
              </span>
              <span className="text-xs font-bold text-slate-900">
                {team.members.length} / {team.maxSize}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  isFull ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{
                  width: `${(team.members.length / team.maxSize) * 100}%`,
                }}
              ></div>
            </div>
            <p className="text-xs text-slate-500">
              {availableSlots > 0
                ? `${availableSlots} ${availableSlots === 1 ? 'seat' : 'seats'} currently open.`
                : 'Team has reached its maximum capacity.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Leader-Only Pending Join Requests Section */}
      {isLeader && (
        <Card className="p-6 border-blue-200 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">
                Pending Join Requests ({team.pendingRequests?.length || 0})
              </h2>
            </div>
            {isFull && (
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                Team is full — cannot accept new requests
              </span>
            )}
          </div>

          <div className="pt-4 divide-y divide-slate-100">
            {team.pendingRequests && team.pendingRequests.length > 0 ? (
              team.pendingRequests.map((req) => (
                <div key={req.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{req.user?.name}</span>
                      <span className="text-xs text-slate-400">({req.user?.email})</span>
                    </div>
                    {req.message && (
                      <p className="text-xs text-slate-600 italic">"{req.message}"</p>
                    )}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {req.user?.skills?.map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
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
                      onClick={() => handleDeclineRequest(req.id)}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      icon={CheckCircle2}
                      disabled={isFull}
                      onClick={() => handleAcceptRequest(req.id)}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-3 text-center">
                No pending join requests for this team.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Team Roster Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-900">
            Current Members ({team.members.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {team.members.map((member) => {
            const isThisUserLeader = member.role === 'LEADER';
            const isSelf = member.userId === user?.id;

            return (
              <Card key={member.id} className="p-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-navy-800 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {member.user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {member.user?.name}
                      </span>
                      {isThisUserLeader && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                          <Crown className="w-3 h-3" /> LEADER
                        </span>
                      )}
                      {isSelf && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{member.user?.email}</p>
                    {member.user?.bio && (
                      <p className="text-xs text-slate-600 line-clamp-1">{member.user.bio}</p>
                    )}

                    {/* Member skills */}
                    <div className="flex flex-wrap gap-1 pt-1.5">
                      {member.user?.skills?.map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Remove button (leader only, cannot remove self) */}
                {isLeader && !isThisUserLeader && (
                  <button
                    onClick={() => handleRemoveMember(member.userId, member.user?.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Remove member"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Audit Log Drawer */}
      <Card className="p-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <FileText className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-bold text-slate-900">Team Audit Trail (Immutable Events)</h2>
        </div>

        <div className="pt-4 divide-y divide-slate-100">
          {auditLogs.length > 0 ? (
            auditLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {log.action}
                  </span>
                  <span className="text-slate-600">
                    by {log.actor?.name || 'System / Direct'}
                  </span>
                </div>
                <span className="text-slate-400 font-mono">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400 py-3 text-center">No audit logs recorded yet.</p>
          )}
        </div>
      </Card>

      {/* Generate Invite Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Share Team Invitation Link"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Send this secure link to a collaborator. It includes a single-use token that expires in 24 hours. Once used, the token is permanently invalidated.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg select-all"
            />
            <Button size="sm" onClick={handleCopyInvite} icon={copiedInvite ? Check : Copy}>
              {copiedInvite ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Transfer Leadership Modal */}
      <Modal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        title="Transfer Team Leadership"
      >
        <form onSubmit={handleTransferLeadership} className="space-y-4">
          <p className="text-xs text-slate-600">
            Select an existing team member to designate as the new team leader. Your role will change to regular MEMBER.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Select New Leader
            </label>
            <select
              required
              value={selectedNewLeader}
              onChange={(e) => setSelectedNewLeader(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="">-- Choose member --</option>
              {team.members
                .filter((m) => m.userId !== user?.id)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.name} ({m.user?.email})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTransferModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={transferring} icon={Crown}>
              Confirm Transfer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

