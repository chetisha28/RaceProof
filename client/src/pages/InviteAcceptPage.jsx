import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { invitesAPI } from '../services/api.js';
import {
  ShieldCheck,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  LogIn,
} from 'lucide-react';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

export const InviteAcceptPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, refreshUser } = useAuth();
  const { success, error } = useToast();

  const [inviteData, setInviteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    invitesAPI
      .get(token)
      .then((res) => {
        setInviteData(res.data.data);
      })
      .catch((err) => {
        setErrorMessage(
          err.response?.data?.message || 'Invalid or expired invitation token.'
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleAcceptInvite = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/invites/${token}` } } });
      return;
    }

    setJoining(true);
    try {
      const res = await invitesAPI.accept(token);
      success('Invitation accepted! You have successfully joined the team.');
      await refreshUser();
      navigate(`/teams/${res.data.data.teamId}`);
    } catch (err) {
      error(err.response?.data?.message || 'Failed to accept invitation.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Validating invitation token..." />;
  }

  if (errorMessage) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card className="p-8 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Invalid Invitation Link</h2>
          <p className="text-sm text-slate-500">{errorMessage}</p>
          <Link to="/teams">
            <Button variant="outline" size="sm">
              Explore Available Teams
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const { team, isExpired, isUsed, isFull } = inviteData || {};

  return (
    <div className="max-w-lg mx-auto py-12">
      <Card className="p-8 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-500/25">
            <Users className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
            Team Invitation
          </span>
          <h1 className="text-2xl font-bold text-slate-900">You're Invited to Join</h1>
          <h2 className="text-xl font-extrabold text-blue-600">{team?.name}</h2>
          <p className="text-xs text-slate-500">
            Hackathon: {team?.hackathon?.name || 'Active Challenge'}
          </p>
        </div>

        {/* Validation Checks */}
        {isExpired ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 inline mr-1.5" />
            This invitation link has expired. Please request a new invite from the team leader.
          </div>
        ) : isUsed ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 inline mr-1.5" />
            This single-use invitation token has already been redeemed.
          </div>
        ) : isFull ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 inline mr-1.5" />
            This team has reached its maximum capacity of {team?.maxSize} members.
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Invitation is valid! Available seats: {team?.maxSize - team?.members?.length}.</span>
          </div>
        )}

        {/* Team details preview */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
          <div>
            <span className="text-slate-400 font-medium">Description:</span>
            <p className="text-slate-700 mt-0.5">{team?.description}</p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <span className="text-slate-400">Leader: {team?.leader?.name}</span>
            <span className="font-bold text-slate-700">
              Capacity: {team?.members?.length} / {team?.maxSize}
            </span>
          </div>
        </div>

        {/* Action Button */}
        {isAuthenticated ? (
          <Button
            size="lg"
            className="w-full"
            loading={joining}
            disabled={isExpired || isUsed || isFull}
            icon={ArrowRight}
            onClick={handleAcceptInvite}
          >
            Accept Invitation & Join Team
          </Button>
        ) : (
          <Link to="/login" state={{ from: { pathname: `/invites/${token}` } }} className="block">
            <Button size="lg" className="w-full" icon={LogIn}>
              Sign In to Accept Invite
            </Button>
          </Link>
        )}
      </Card>
    </div>
  );
};

