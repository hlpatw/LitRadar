import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import RoutesComponent from './app.tsx';
import './index.css';
import { Toaster } from '@client/src/components/ui/sonner';
import { AuthProvider } from '@client/src/contexts/AuthContext';
import { createPortal } from 'react-dom';

const MainApp = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary fallback={<div>Something went wrong</div>}>
          <RoutesComponent />
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);