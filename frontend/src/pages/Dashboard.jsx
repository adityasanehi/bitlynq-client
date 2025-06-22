import React, { useState, useEffect } from 'react';
import { useTorrents } from '../context/TorrentContext';
import TorrentList from '../components/TorrentList';
import AddTorrentModal from '../components/AddTorrentModal';
import StatsOverview from '../components/StatsOverview';
import { PlusIcon, MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { 
    torrents, 
    loading, 
    error, 
    searchTorrents, 
    sortTorrents, 
    getTorrentsByStatus,
    formatBytes,
    formatSpeed 
  } = useTorrents();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('added_time');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

  // Filter and sort torrents
  const getFilteredTorrents = () => {
    let filtered = torrents;
    
    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = getTorrentsByStatus(filterStatus);
    }
    
    // Apply search
    if (searchQuery.trim()) {
      filtered = searchTorrents(filtered, searchQuery);
    }
    
    // Apply sorting
    return sortTorrents(filtered, sortBy, sortOrder);
  };

  const filteredTorrents = getFilteredTorrents();

  // Calculate dashboard stats
  const stats = {
    total: torrents.length,
    downloading: getTorrentsByStatus('downloading').length,
    completed: getTorrentsByStatus('completed').length,
    seeding: getTorrentsByStatus('seeding').length,
    paused: getTorrentsByStatus('paused').length,
    totalDownloadRate: torrents.reduce((sum, t) => sum + (t.download_rate || 0), 0),
    totalUploadRate: torrents.reduce((sum, t) => sum + (t.upload_rate || 0), 0),
    totalSize: torrents.reduce((sum, t) => sum + (t.size || 0), 0),
    totalDownloaded: torrents.reduce((sum, t) => sum + (t.downloaded || 0), 0),
  };

  const statusOptions = [
    { value: 'all', label: 'All Torrents', count: stats.total },
    { value: 'downloading', label: 'Downloading', count: stats.downloading },
    { value: 'completed', label: 'Completed', count: stats.completed },
    { value: 'seeding', label: 'Seeding', count: stats.seeding },
    { value: 'paused', label: 'Paused', count: stats.paused },
  ];

  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'added_time', label: 'Date Added' },
    { value: 'size', label: 'Size' },
    { value: 'progress', label: 'Progress' },
    { value: 'download_rate', label: 'Download Speed' },
    { value: 'upload_rate', label: 'Upload Speed' },
    { value: 'status', label: 'Status' },
  ];

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Connection Error
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Torrent Dashboard
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Manage your torrents, monitor downloads, and sync to the cloud
              </p>
            </div>
            <div className="mt-4 sm:mt-0">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Add Torrent
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <StatsOverview stats={stats} />
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search torrents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Filters and Sort */}
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              {/* Status Filter */}
              <div className="flex items-center space-x-2">
                <FunnelIcon className="w-5 h-5 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div className="flex items-center space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  {sortOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      Sort by {option.label}
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm"
                  title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {/* View Mode */}
              <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  Grid
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Torrent List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredTorrents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📁</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {searchQuery || filterStatus !== 'all' ? 'No matching torrents' : 'No torrents yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {searchQuery || filterStatus !== 'all' 
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by adding your first torrent'
              }
            </p>
            {(!searchQuery && filterStatus === 'all') && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Add Your First Torrent
              </button>
            )}
          </div>
        ) : (
          <TorrentList 
            torrents={filteredTorrents} 
            viewMode={viewMode}
          />
        )}
      </div>

      {/* Add Torrent Modal */}
      {showAddModal && (
        <AddTorrentModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;