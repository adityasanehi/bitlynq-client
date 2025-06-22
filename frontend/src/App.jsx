import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CloudSync from './pages/CloudSync';
import LANSync from './pages/LANSync';
import Settings from './pages/Settings';
import TorrentDetails from './pages/TorrentDetails';
import { TorrentProvider } from './context/TorrentContext';
import { SettingsProvider } from './context/SettingsContext';
import { WebSocketProvider } from './context/WebSocketContext';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    // Load theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setDarkMode(savedTheme === 'dark');
    }
  }, []);

  useEffect(() => {
    // Apply theme
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleTheme = () => setDarkMode(!darkMode);

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 ${darkMode ? 'dark' : ''}`}>
      <SettingsProvider>
        <TorrentProvider>
          <WebSocketProvider>
            <Router>
              <div className="flex h-screen overflow-hidden">
                {/* Sidebar */}
                <Sidebar 
                  isOpen={sidebarOpen} 
                  onToggle={toggleSidebar}
                  darkMode={darkMode}
                  onToggleTheme={toggleTheme}
                />

                {/* Main content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Mobile header */}
                  <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                    <button
                      onClick={toggleSidebar}
                      className="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Page content */}
                  <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/cloud" element={<CloudSync />} />
                      <Route path="/lan" element={<LANSync />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/torrent/:hash" element={<TorrentDetails />} />
                    </Routes>
                  </main>
                </div>
              </div>

              

              {/* Toast notifications */}
              <Toaster
                position="bottom-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: darkMode ? '#374151' : '#FFFFFF',
                    color: darkMode ? '#F3F4F6' : '#111827',
                    border: darkMode ? '1px solid #4B5563' : '1px solid #E5E7EB',
                  },
                  success: {
                    iconTheme: {
                      primary: '#10B981',
                      secondary: '#FFFFFF',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#EF4444',
                      secondary: '#FFFFFF',
                    },
                  },
                }}
              />
            </Router>
          </WebSocketProvider>
        </TorrentProvider>
      </SettingsProvider>
    </div>
  );
}

export default App;