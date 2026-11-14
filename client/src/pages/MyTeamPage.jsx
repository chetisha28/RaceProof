import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Users, Compass, PlusCircle } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

export const MyTeamPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const myMembership = user?.memberships?.[0];

  useEffect(() => {
    if (myMembership?.teamId) {
      // Redirect to full team management page
      navigate(`/teams/${myMembership.teamId}`, { replace: true });
    }
  }, [myMembership, navigate]);

  if (myMembership?.teamId) {
    return null; // Will redirect
  }

  return (
    <div className="py-12 max-w-xl mx-auto">
      <EmptyState
        icon={Users}
        title="You don't have a team yet"
        description="To participate in a hackathon, find an open team looking for your skills or create a team and invite collaborators."
        action={
          <div className="flex items-center gap-3">
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
        }
      />
    </div>
  );
};

