import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import Dashboard from './pages/Dashboard/Dashboard';
import Journals from './pages/Journals/Journals';
import Sources from './pages/Sources/Sources';
import SourceDetail from './pages/Sources/SourceDetail';
import Papers from './pages/Papers/Papers';
import PaperDetail from './pages/Papers/PaperDetail';
import Library from './pages/Library/Library';
import AdminSources from './pages/Admin/AdminSources';
import Notes from './pages/Notes/Notes';
import Settings from './pages/Settings/Settings';
import Digest from './pages/Digest/Digest';
import SchedulerAdmin from './pages/SchedulerAdmin/SchedulerAdmin';
import LoginPage from './pages/Login/LoginPage';
import RegisterPage from './pages/Register/RegisterPage';
import { useAuth } from '@/contexts/AuthContext';

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

const RoutesComponent = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="journals" element={<Journals />} />
        <Route path="sources" element={<Sources />} />
        <Route path="sources/:sourceId" element={<SourceDetail />} />
        <Route path="papers" element={<Papers />} />
        <Route path="papers/:id" element={<PaperDetail />} />
        <Route path="library" element={<Library />} />
        <Route path="checklist" element={<Navigate to="/library?status=todo" replace />} />
        <Route path="admin/sources" element={<AdminSources />} />
        <Route path="admin/scheduler" element={<SchedulerAdmin />} />
        <Route path="digest" element={<Digest />} />
        <Route path="notes" element={<Notes />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;