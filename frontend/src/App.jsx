import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Import Pages (Make sure these filenames match what you create in your /pages folder)
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FileManager from './pages/FileManager';

// Helper Component to protect private dashboard paths
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased selection:bg-blue-500 selection:text-white">
      <Routes>
        {/* Public Route: Auth */}
        <Route 
          path="/login" 
          element={!user ? <Login /> : <Navigate to="/dashboard" replace />} 
        />

        {/* Private Protected Routes */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/files" 
          element={
            <ProtectedRoute>
              <FileManager />
            </ProtectedRoute>
          } 
        />

        {/* Dynamic Fallback / Catch-all Redirect */}
        <Route 
          path="*" 
          element={<Navigate to={user ? "/dashboard" : "/login"} replace />} 
        />
      </Routes>
    </div>
  );
}

export default App;