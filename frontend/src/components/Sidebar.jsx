import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon, 
  CloudIcon, 
  WifiIcon, 
  CogIcon,
  SunIcon,
  MoonIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useTorrents } from '../context/TorrentContext';
import { useWebSocket } from '../context/WebSocketContext';

const Sidebar = ({ isOpen, onToggle, darkMode, onToggleTheme }) => {
  const location = useLocation();
  const { stats } = useTorrents();
  const { ConnectionStatus } = useWebSocket();

  const navigation = [
    { 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: HomeIcon,
      count: stats?.activeTorrents || 0
    },
    { 
      name: 'Cloud Sync', 
      href: '/cloud', 
      icon: CloudIcon 
    },
    { 
      name: 'LAN Sync', 
      href: '/lan', 
      icon: WifiIcon 
    },
    { 
      name: 'Settings', 
      href: '/settings', 
      icon: CogIcon 
    },
  ];

  const isCurrentPath = (href) => {
    return location.pathname === href;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={onToggle}
        >
          <div className="absolute inset-0 bg-gray-600 opacity-75"></div>
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <img src="./logo.png" alt="Logo" className="w-8 h-8" />
              <h1 className="ml-3 text-lg font-semibold text-gray-900 dark:text-white">
                BitLynq
              </h1>
            </div>
            <button
              onClick={onToggle}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isCurrent = isCurrentPath(item.href);
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => {
                    // Close mobile sidebar when navigating
                    if (window.innerWidth < 1024) {
                      onToggle();
                    }
                  }}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isCurrent
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`mr-3 h-6 w-6 ${
                      isCurrent
                        ? 'text-blue-500 dark:text-blue-400'
                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                    }`}
                  />
                  <span className="flex-1">{item.name}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className={`ml-3 inline-block py-0.5 px-2 text-xs font-medium rounded-full ${
                      isCurrent
                        ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-300'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Stats Summary */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Quick Stats
              </h3>
              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Active:</span>
                  <span className="font-medium">{stats?.activeTorrents || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Download:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {stats?.downloadRate ? `${(stats.downloadRate / 1024 / 1024).toFixed(1)} MB/s` : '0 MB/s'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Upload:</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {stats?.uploadRate ? `${(stats.uploadRate / 1024 / 1024).toFixed(1)} MB/s` : '0 MB/s'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              
              <ConnectionStatus />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                v1.0.0
              </span>
              <button
                onClick={onToggleTheme}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
              >
                {darkMode ? (
                  <SunIcon className="w-5 h-5" />
                ) : (
                  <MoonIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;