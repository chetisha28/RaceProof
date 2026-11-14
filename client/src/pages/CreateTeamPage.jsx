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
    maxSize: 4,
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
      const res = await teamsAPI.create({
        ...formData,
        maxSize: parseInt(formData.maxSize, 10),
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

          {/* Capacity Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Maximum Team Capacity (2 to 10 members)
              </label>
              <span className="text-base font-extrabold text-blue-600 px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-200">
                {formData.maxSize} Members
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={10}
              value={formData.maxSize}
              onChange={(e) => setFormData({ ...formData, maxSize: e.target.value })}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Min: 2 members</span>
              <span>Default: 4 members</span>
              <span>Max: 10 members</span>
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

