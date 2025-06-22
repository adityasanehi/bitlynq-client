import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeftIcon,
  PlayIcon,
  PauseIcon,
  TrashIcon,
  CloudArrowUpIcon,
  DocumentDuplicateIcon,
  ChartBarIcon,
  UsersIcon,
  GlobeAltIcon,
  FolderIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { useTorrents } from '../context/TorrentContext';
import { torrentAPI, cloudAPI } from '../services/api';
import toast from 'react-hot-toast';

const TorrentDetails = () => {
  const { hash } = useParams();
  const { 
    getTorrent, 
    pauseTorrent, 
    resumeTorrent, 
    removeTorrent,
    formatBytes,
    formatSpeed,
    formatTime,
    getStatusColor,
    getStatusIcon,
    calculateETA
  } = useTorrents();

  const [torrent, setTorrent] = useState(null);
  const [peers, setPeers] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [pieces, setPieces] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hash) {
      loadTorrentDetails();
      const interval = setInterval(loadTorrentDetails, 2000); // Update every 2 seconds
      return () => clearInterval(interval);
    }
  }, [hash]);

  const loadTorrentDetails = async () => {
    try {
      const torrentData = getTorrent(hash);
      if (torrentData) {
        setTorrent(torrentData);
        
        // Load additional details
        const [peersData, trackersData, piecesData] = await Promise.all([
          torrentAPI.getTorrentPeers(hash).catch(() => []),
          torrentAPI.getTorrentTrackers(hash).catch(() => []),
          torrentAPI.getTorrentPieces(hash).catch(() => null)
        ]);
        
        setPeers(peersData);
        setTrackers(trackersData);
        setPieces(piecesData);
      }
    } catch (error) {
      console.error('Failed to load torrent details:', error);
      toast.error('Failed to load torrent details');
    } finally {
      setLoading(false);
    }
  };

  const handlePauseResume = async () => {
    if (torrent.status === 'paused') {
      await resumeTorrent(torrent.hash);
    } else {
      await pauseTorrent(torrent.hash);
    }
  };

  const handleRemove = async (deleteFiles = false) => {
    if (window.confirm(`Are you sure you want to remove "${torrent.name}"?`)) {
      await removeTorrent(torrent.hash, deleteFiles);
      // Navigate back to dashboard
      window.history.back();
    }
  };

  const handleUploadToCloud = async (provider) => {
    if (torrent.status !== 'completed' && torrent.status !== 'seeding') {
      toast.error('Torrent must be completed or seeding before uploading');
      return;
    }

    setUploading(true);
    try {
      await cloudAPI.uploadToCloud(torrent.hash, provider);
      toast.success(`Upload started to ${provider.toUpperCase()}`);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const copyMagnetLink = () => {
    if (torrent.magnet_link) {
      navigator.clipboard.writeText(torrent.magnet_link);
      toast.success('Magnet link copied to clipboard');
    }
  };

  const forceReannounce = async () => {
    try {
      await torrentAPI.forceReannounce(hash);
      toast.success('Forced reannounce to trackers');
    } catch (error) {
      console.error('Failed to reannounce:', error);
      toast.error('Failed to reannounce');
    }
  };

  const forceRecheck = async () => {
    try {
      await torrentAPI.forceRecheck(hash);
      toast.success('Started file recheck');
    } catch (error) {
      console.error('Failed to recheck:', error);
      toast.error('Failed to start recheck');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!torrent) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Torrent Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The requested torrent could not be found.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const StatusIcon = ({ status }) => {
    const iconPath = getStatusIcon(status);
    return (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
    );
  };

  const eta = calculateETA(torrent);

  const tabs = [
    { id: 'overview', name: 'Overview', icon: ChartBarIcon },
    { id: 'files', name: 'Files', icon: FolderIcon },
    { id: 'peers', name: 'Peers', icon: UsersIcon },
    { id: 'trackers', name: 'Trackers', icon: GlobeAltIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Link
                to="/dashboard"
                className="mr-4 p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ArrowLeftIcon className="w-6 h-6" />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white truncate">
                  {torrent.name}
                </h1>
                <div className="flex items-center mt-2">
                  <div className={`mr-2 ${getStatusColor(torrent.status)}`}>
                    <StatusIcon status={torrent.status} />
                  </div>
                  <span className={`text-sm font-medium capitalize ${getStatusColor(torrent.status)}`}>
                    {torrent.status}
                  </span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {torrent.progress.toFixed(1)}% complete
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePauseResume}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {torrent.status === 'paused' ? (
                  <>
                    <PlayIcon className="w-4 h-4 mr-2" />
                    Resume
                  </>
                ) : (
                  <>
                    <PauseIcon className="w-4 h-4 mr-2" />
                    Pause
                  </>
                )}
              </button>

              {(torrent.status === 'completed' || torrent.status === 'seeding') && (
                <button
                  onClick={() => handleUploadToCloud('gdrive')}
                  disabled={uploading}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {uploading ? (<>
                      <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <CloudArrowUpIcon className="w-4 h-4 mr-2" />
                      Upload to Cloud
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => handleRemove(false)}
                className="inline-flex items-center px-4 py-2 border border-red-300 dark:border-red-600 rounded-md shadow-sm text-sm font-medium text-red-700 dark:text-red-300 bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <TrashIcon className="w-4 h-4 mr-2" />
                Remove
              </button>
            </div>
          </div>
        </div>

        {/* Progress Section */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Progress: {torrent.progress.toFixed(1)}%</span>
            <span>{formatBytes(torrent.downloaded)} / {formatBytes(torrent.size)}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(torrent.progress, 100)}%` }}
            ></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400">Download Speed</div>
              <div className="font-semibold text-green-600 dark:text-green-400">
                {formatSpeed(torrent.download_rate)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400">Upload Speed</div>
              <div className="font-semibold text-blue-600 dark:text-blue-400">
                {formatSpeed(torrent.upload_rate)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400">Peers</div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {torrent.peers} / {torrent.seeds}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 dark:text-gray-400">ETA</div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {eta ? formatTime(eta) : 'Unknown'}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <Icon className="w-5 h-5 inline mr-2" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {activeTab === 'overview' && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Basic Information
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Hash:</span>
                      <span className="font-mono text-xs text-gray-900 dark:text-white">
                        {torrent.hash}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Size:</span>
                      <span className="text-gray-900 dark:text-white">{formatBytes(torrent.size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Added:</span>
                      <span className="text-gray-900 dark:text-white">
                        {new Date(torrent.added_time).toLocaleString()}
                      </span>
                    </div>
                    {torrent.completed_time && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Completed:</span>
                        <span className="text-gray-900 dark:text-white">
                          {new Date(torrent.completed_time).toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Save Path:</span>
                      <span className="text-gray-900 dark:text-white truncate ml-2" title={torrent.save_path}>
                        {torrent.save_path}
                      </span>
                    </div>
                  </div>

                  {torrent.magnet_link && (
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                          Magnet Link
                        </h4>
                        <button
                          onClick={copyMagnetLink}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                          title="Copy magnet link"
                        >
                          <DocumentDuplicateIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                        <code className="text-xs text-gray-700 dark:text-gray-300 break-all">
                          {torrent.magnet_link}
                        </code>
                      </div>
                    </div>
                  )}
                </div>

                {/* Transfer Stats */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Transfer Statistics
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Downloaded:</span>
                      <span className="text-gray-900 dark:text-white">
                        {formatBytes(torrent.downloaded)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Uploaded:</span>
                      <span className="text-gray-900 dark:text-white">
                        {formatBytes(torrent.uploaded)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Ratio:</span>
                      <span className="text-gray-900 dark:text-white">
                        {torrent.downloaded > 0 ? (torrent.uploaded / torrent.downloaded).toFixed(2) : '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Availability:</span>
                      <span className="text-gray-900 dark:text-white">
                        {((torrent.seeds + torrent.peers) / Math.max(torrent.seeds + torrent.peers, 1) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 space-y-2">
                    <button
                      onClick={forceReannounce}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Force Reannounce
                    </button>
                    <button
                      onClick={forceRecheck}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Force Recheck
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Files ({torrent.files?.length || 0})
              </h3>
              {torrent.files && torrent.files.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Progress
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {torrent.files.map((file, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            <div className="truncate max-w-md" title={file.path}>
                              {file.path}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {formatBytes(file.size)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${Math.min(file.progress * 100, 100)}%` }}
                                ></div>
                              </div>
                              <span>{(file.progress * 100).toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No file information available</p>
              )}
            </div>
          )}

          {activeTab === 'peers' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Peers ({peers.length})
              </h3>
              {peers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          IP Address
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Client
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Progress
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Down Speed
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Up Speed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {peers.map((peer, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {peer.ip}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {peer.client || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {(peer.progress * 100).toFixed(1)}%
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {formatSpeed(peer.download_rate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {formatSpeed(peer.upload_rate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No peers connected</p>
              )}
            </div>
          )}

          {activeTab === 'trackers' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Trackers ({trackers.length})
              </h3>
              {trackers.length > 0 ? (
                <div className="space-y-3">
                  {trackers.map((tracker, index) => (
                    <div
                      key={index}
                      className="p-4 bg-gray-50 dark:bg-gray-700 rounded-md"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {tracker.url}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Tier {tracker.tier} • Source: {tracker.source}
                          </p>
                        </div>
                        <div className="ml-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                            Active
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No trackers configured</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TorrentDetails;