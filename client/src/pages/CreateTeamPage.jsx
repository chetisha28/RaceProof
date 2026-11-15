import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { hackathonsAPI, teamsAPI } from '../services/api.js';
import { Users, PlusCircle, Trophy, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';

export const CreateTeamPage = () => {
  const { user, refreshUser } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [hackathons, setHackathons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hackathonId: '',
    minSize: 2,
    maxSize: 4,
    requiredSkills: '',
  });

  useEffect(() => {
    hackathonsAPI.getAll().then((res) => {
      const data = res.data.data || [];
      setHackathons(data);
      if (data.length > 0) {
        setFormData((prev) => ({ ...prev, hackathonId: data[0].id }));
      }
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.description || !formData.hackathonId) {
      error('Please complete all required fields.');
      return;
    }

    setLoading(true);
    try {
      const requiredSkills = formData.requiredSkills
        ? formData.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const res = await teamsAPI.create({
        name: formData.name,
        description: formData.description,
        hackathonId: formData.hackathonId,
        minSize: parseInt(formData.minSize, 10),
        maxSize: parseInt(formData.maxSize, 10),
        requiredSkills,
      });

      success(`Team "${res.data.data.name}" created! You are now the team leader.`);
      await refreshUser();
      navigate(`/teams/${res.data.data.id}`);
    } catch (err) {
      error(err.response?.data?.message || 'Failed to create team.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Card className="p-8 shadow-xl">
        <div className="flex items-center gap-3 pb-6 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Form a New Hackathon Team</h1>
            <p className="text-xs text-slate-500">
              You will automatically become the team leader and first member
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 pt-6">
          {/* Hackathon Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Select Hackathon *
            </label>
            <div className="relative">
              <select
                required
                value={formData.hackathonId}
                onChange={(e) => setFormData({ ...formData, hackathonId: e.target.value })}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {hackathons.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Team Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Team Name *
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Distributed Consensus Heroes"
              className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Project Vision & Description *
            </label>
            <textarea
              rows={3}
              required
              minLength={5}
              maxLength={1000}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What project are you building? What skills are you looking for in teammates?"
              className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Required Skills */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Required Skills (Comma-separated)
            </label>
            <input
              type="text"
              value={formData.requiredSkills}
              onChange={(e) => setFormData({ ...formData, requiredSkills: e.target.value })}
              placeholder="e.g. React, Node.js, PostgreSQL, TypeScript"
              className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Used to score and recommend matching teammates based on complementary skills.
            </p>
          </div>

          {/* Capacity Settings: minSize and maxSize */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Min Team Size
                </label>
                <span className="text-sm font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                  {formData.minSize} Members
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={Math.min(10, parseInt(formData.maxSize, 10) || 10)}
                value={formData.minSize}
                onChange={(e) => setFormData({ ...formData, minSize: Math.min(parseInt(e.target.value, 10), parseInt(formData.maxSize, 10)) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[11px] text-slate-400">Target minimum for readiness</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Max Team Capacity
                </label>
                <span className="text-sm font-bold text-blue-600 px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
                  {formData.maxSize} Members
                </span>
              </div>
              <input
                type="range"
                min={Math.max(2, parseInt(formData.minSize, 10) || 2)}
                max={10}
                value={formData.maxSize}
                onChange={(e) => {
                  const newMax = parseInt(e.target.value, 10);
                  setFormData({
                    ...formData,
                    maxSize: newMax,
                    minSize: Math.min(parseInt(formData.minSize, 10), newMax),
                  });
                }}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[11px] text-slate-400">Hard limit enforced by locking</span>
            </div>
          </div>

          {/* Invariant Reminder */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-blue-600" />
              Transactional Invariant Enforced
            </div>
            <p>
              Once created, exactly {formData.maxSize} members can fill this team. PostgreSQL transaction locking strictly protects against oversubscription under concurrent join attempts.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} icon={PlusCircle}>
              Create Team & Lock Capacity
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

