import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import Dashboard from './pages/Dashboard/Dashboard';
import Journals from './pages/Journals/Journals';
import Papers from './pages/Papers/Papers';
import PaperDetail from './pages/Papers/PaperDetail';
import Checklist from './pages/Checklist/Checklist';
import Notes from './pages/Notes/Notes';
import Settings from './pages/Settings/Settings';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="journals" element={<Journals />} />
        <Route path="papers" element={<Papers />} />
        <Route path="papers/:id" element={<PaperDetail />} />
        <Route path="checklist" element={<Checklist />} />
        <Route path="notes" element={<Notes />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;