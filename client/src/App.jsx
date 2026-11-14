import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout.jsx';
import { ProtectedRoute } from './layouts/ProtectedRoute.jsx';

import { LandingPage } from './pages/LandingPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ExploreTeamsPage } from './pages/ExploreTeamsPage.jsx';
import { CreateTeamPage } from './pages/CreateTeamPage.jsx';
import { TeamDetailsPage } from './pages/TeamDetailsPage.jsx';
import { JoinRequestsPage } from './pages/JoinRequestsPage.jsx';
import { MyTeamPage } from './pages/MyTeamPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { InviteAcceptPage } from './pages/InviteAcceptPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        {/* Public Routes */}
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="teams" element={<ExploreTeamsPage />} />
        <Route path="teams/:id" element={<TeamDetailsPage />} />
        <Route path="invites/:token" element={<InviteAcceptPage />} />

        {/* Authenticated Protected Routes */}
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teams/create"
          element={
            <ProtectedRoute>
              <CreateTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="requests"
          element={
            <ProtectedRoute>
              <JoinRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-team"
          element={
            <ProtectedRoute>
              <MyTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

