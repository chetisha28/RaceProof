import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { teamsAPI, requestsAPI } from '../services/api.js';
import { useSSE } from '../hooks/useSSE.js';
import {
  Search,
  Filter,
  Users,
  UserPlus,
  Compass,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Modal } from '../components/Modal.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

const POPULAR_SKILLS = ['All', 'React', 'Node.js', 'PostgreSQL', 'Python', 'TypeScript', 'Docker'];

export const ExploreTeamsPage = () => {
  const { user, isAuthenticated } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  // Join Request Modal state
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [joinMessage, setJoinMessage] = useState('');
  const [submittingJoin, setSubmittingJoin] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      const params = {
        page,
        limit: 9,
        status: selectedStatus,
      };
      if (search.trim()) params.search = search.trim();
      if (selectedSkill !== 'All') params.skill = selectedSkill;

      const res = await teamsAPI.getAll(params);
      setTeams(res.data.data || []);
      setPagination(res.data.pagination || null);
    } catch (err) {
      console.error('Error fetching teams:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedSkill, selectedStatus]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Real-time SSE updates
  useSSE(
    useCallback(() => {
      fetchTeams();
    }, [fetchTeams])
  );

  const handleOpenJoinModal = (team) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setSelectedTeam(team);
    setJoinMessage(`Hi ${team.leader?.name || 'Leader'}, I would love to join your team!`);
    setJoinModalOpen(true);
  };

  const handleSendJoinRequest = async (e) => {
    e.preventDefault();
    if (!selectedTeam) return;

    setSubmittingJoin(true);
    try {
      await requestsAPI.create(selectedTeam.id, joinMessage);
      success(`Join request submitted to "${selectedTeam.name}"!`);
      setJoinModalOpen(false);
      fetchTeams();
    } catch (err) {
      error(err.response?.data?.message || 'Failed to submit request.');
    } finally {
      setSubmittingJoin(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
            Explore Hackathon Teams
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Discover open teams, filter by required technical skills, and send join requests
          </p>
        </div>

        {isAuthenticated && (
          <Link to="/teams/create">
            <Button icon={UserPlus}>Create New Team</Button>
          </Link>
        )}
      </div>

      {/* Search & Filter Bar */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search teams by name or description..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
              Status:
            </span>
            <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              {['ACTIVE', 'FULL', 'ALL'].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSelectedStatus(s);
                    setPage(1);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    selectedStatus === s
                      ? 'bg-white text-slate-900 shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Skill Pills */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
            Filter by Skill:
          </span>
          {POPULAR_SKILLS.map((skill) => (
            <button
              key={skill}
              onClick={() => {
                setSelectedSkill(skill);
                setPage(1);
              }}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                selectedSkill === skill
                  ? 'bg-blue-600 border-blue-600 text-white font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {skill}
            </button>
          ))}
        </div>
      </Card>

      {/* Teams Grid */}
      {loading ? (
        <LoadingSpinner text="Searching available teams..." />
      ) : teams.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No teams match your query"
          description="Try adjusting your search terms or filters to find open teams looking for collaborators."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setSelectedSkill('All');
                setSelectedStatus('ALL');
              }}
            >
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => {
            const isFull = team.memberCount >= team.maxSize;
            const isUserInThisTeam = user?.memberships?.some((m) => m.teamId === team.id);

            return (
              <Card key={team.id} className="flex flex-col p-6 h-full justify-between" hover>
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <Link
                        to={`/teams/${team.id}`}
                        className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1"
                      >
                        {team.name}
                      </Link>
                      <span className="text-xs text-slate-400 font-medium">
                        Hackathon: {team.hackathon?.name || 'Main Sprint'}
                      </span>
                    </div>
                    <Badge variant={team.status} size="xs" />
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {team.description}
                  </p>

                  {/* Capacity Bar */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">Team Capacity</span>
                      <span className="font-bold text-slate-900">
                        {team.memberCount} / {team.maxSize}{' '}
                        <span className="text-slate-400 font-normal">
                          ({team.availableSeats} {team.availableSeats === 1 ? 'seat' : 'seats'} left)
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isFull ? 'bg-amber-500' : 'bg-blue-600'
                        }`}
                        style={{
                          width: `${(team.memberCount / team.maxSize) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Member skills / requirements */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Team Stack & Skills:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {team.teamSkills && team.teamSkills.length > 0 ? (
                        team.teamSkills.slice(0, 5).map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No skills listed</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Leader:{' '}
                    <span className="font-semibold text-slate-700">{team.leader?.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={`/teams/${team.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>

                    {!isUserInThisTeam && (
                      <Button
                        size="sm"
                        disabled={isFull}
                        onClick={() => handleOpenJoinModal(team)}
                      >
                        {isFull ? 'Full' : 'Join'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs font-semibold text-slate-600 px-3">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Join Request Modal */}
      <Modal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        title={`Request to Join "${selectedTeam?.name}"`}
      >
        <form onSubmit={handleSendJoinRequest} className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed">
            <strong>Capacity Note:</strong> If accepted by the team leader, your membership will be committed inside an atomic PostgreSQL transaction.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Personal Message to Leader
            </label>
            <textarea
              rows={3}
              required
              value={joinMessage}
              onChange={(e) => setJoinMessage(e.target.value)}
              placeholder="Introduce your skills and why you'd be a great teammate..."
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setJoinModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={submittingJoin} icon={ArrowRight}>
              Submit Join Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

