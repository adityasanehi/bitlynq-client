import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  PlayIcon, 
  PauseIcon, 
  TrashIcon, 
  EllipsisVerticalIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  UsersIcon,
  CloudArrowUpIcon,
  StopIcon
} from '@heroicons/react/24/outline';
import { useTorrents } from '../context/TorrentContext';
import toast from 'react-hot-toast';

const TorrentList = ({ torrents, viewMode = 'list' }) => {
  const { 
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
  
  const [expandedTorrent, setExpandedTorrent] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [uploading, setUploading] = useState({});

  const handlePauseResume = async (torrent) => {
    if (torrent.status === 'paused') {
      await resumeTorrent(torrent.hash);
    } else {
      await pauseTorrent(torrent.hash);
    }
  };

  const handleRemove = async (hash, deleteFiles = false) => {
    await removeTorrent(hash, deleteFiles);
    setShowDeleteConfirm(null);
  };

  // ✅ NEW: Handle stop seeding
  const handleStopSeeding = async (torrentHash) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const API_KEY = import.meta.env.VITE_API_KEY || 'dev-secret-key-change-in-production';
      
      const response = await fetch(`${API_BASE_URL}/torrent/${torrentHash}/mark_completed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      });
      
      if (response.ok) {
        toast.success('Torrent marked as completed - ready for upload');
        // The WebSocket will automatically update the torrent status
      } else {
        const error = await response.json();
        toast.error(`Failed to mark as completed: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error stopping seeding:', error);
      toast.error('Failed to stop seeding');
    }
  };

  // ✅ NEW: Handle cloud upload
  const handleUploadToCloud = async (torrentHash, provider = 'gdrive') => {
    try {
      setUploading(prev => ({ ...prev, [torrentHash]: true }));
      
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const API_KEY = import.meta.env.VITE_API_KEY || 'dev-secret-key-change-in-production';
      
      const response = await fetch(`${API_BASE_URL}/cloud/upload/${torrentHash}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ provider }),
      });
      
      if (response.ok) {
        const result = await response.json();
        toast.success(`Upload started to ${provider.toUpperCase()}`);
      } else {
        const error = await response.json();
        toast.error(`Upload failed: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error uploading to cloud:', error);
      toast.error('Failed to start upload');
    } finally {
      setUploading(prev => ({ ...prev, [torrentHash]: false }));
    }
  };

  // ✅ NEW: Check if torrent is ready for upload
  const isReadyForUpload = (torrent) => {
    return (torrent.status === 'completed' || torrent.status === 'seeding') && 
           torrent.progress >= 100;
  };

  const getProgressColor = (progress, status) => {
    if (status === 'completed') return 'bg-green-500';
    if (status === 'seeding') return 'bg-purple-500';
    if (status === 'error') return 'bg-red-500';
    if (status === 'paused') return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const StatusIcon = ({ status }) => {
    const iconPath = getStatusIcon(status);
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
    );
  };

  const TorrentCard = ({ torrent }) => {
    const eta = calculateETA(torrent);
    const isExpanded = expandedTorrent === torrent.hash;
    const readyForUpload = isReadyForUpload(torrent);
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
        {/* Main Content */}
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* Title and Status */}
              <div className="flex items-center mb-2">
                <div className={`mr-2 ${getStatusColor(torrent.status)}`}>
                  <StatusIcon status={torrent.status} />
                </div>
                <Link
                  to={`/torrent/${torrent.hash}`}
                  className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate"
                  title={torrent.name}
                >
                  {torrent.name}
                </Link>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{torrent.progress.toFixed(1)}%</span>
                  <span className="capitalize">{torrent.status}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(torrent.progress, torrent.status)}`}
                    style={{ width: `${Math.min(torrent.progress, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center">
                  <ArrowDownIcon className="w-4 h-4 mr-1 text-green-500" />
                  <span>{formatSpeed(torrent.download_rate)}</span>
                </div>
                <div className="flex items-center">
                  <ArrowUpIcon className="w-4 h-4 mr-1 text-blue-500" />
                  <span>{formatSpeed(torrent.upload_rate)}</span>
                </div>
                <div className="flex items-center">
                  <UsersIcon className="w-4 h-4 mr-1" />
                  <span>{torrent.peers} peers</span>
                </div>
                <div className="flex items-center">
                  <ClockIcon className="w-4 h-4 mr-1" />
                  <span>{eta ? formatTime(eta) : 'Unknown'}</span>
                </div>
              </div>

              {/* Size and Downloaded */}
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{formatBytes(torrent.downloaded)} / {formatBytes(torrent.size)}</span>
                {torrent.status === 'seeding' && (
                  <span className="ml-2">• Uploaded: {formatBytes(torrent.uploaded)}</span>
                )}
              </div>

              {/* ✅ NEW: Upload and Stop Seeding Actions */}
              {readyForUpload && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleUploadToCloud(torrent.hash)}
                    disabled={uploading[torrent.hash]}
                    className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {uploading[torrent.hash] ? (
                      <>
                        <div className="animate-spin -ml-1 mr-1 h-3 w-3 border border-white border-t-transparent rounded-full"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <CloudArrowUpIcon className="w-3 h-3 mr-1" />
                        Upload to Cloud
                      </>
                    )}
                  </button>
                  
                  {torrent.status === 'seeding' && (
                    <button
                      onClick={() => handleStopSeeding(torrent.hash)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      <StopIcon className="w-3 h-3 mr-1" />
                      Stop Seeding
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2 ml-4">
              <button
                onClick={() => handlePauseResume(torrent)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={torrent.status === 'paused' ? 'Resume' : 'Pause'}
              >
                {torrent.status === 'paused' ? (
                  <PlayIcon className="w-5 h-5" />
                ) : (
                  <PauseIcon className="w-5 h-5" />
                )}
              </button>
              
              <button
                onClick={() => setShowDeleteConfirm(torrent.hash)}
                className="p-2 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Remove"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
              
              <button
                onClick={() => setExpandedTorrent(isExpanded ? null : torrent.hash)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="More info"
              >
                <EllipsisVerticalIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Details</h4>
                  <div className="space-y-1 text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between">
                      <span>Hash:</span>
                      <span className="font-mono text-xs">{torrent.hash.substring(0, 16)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Added:</span>
                      <span>{new Date(torrent.added_time).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Seeds:</span>
                      <span>{torrent.seeds}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Save Path:</span>
                      <span className="truncate ml-2" title={torrent.save_path}>
                        {torrent.save_path}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Files</h4>
                  <div className="text-gray-600 dark:text-gray-400">
                    {torrent.files && torrent.files.length > 0 ? (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {torrent.files.slice(0, 5).map((file, index) => (
                          <div key={index} className="text-xs">
                            <div className="flex justify-between">
                              <span className="truncate">{file.path}</span>
                              <span className="ml-2">{formatBytes(file.size)}</span>
                            </div>
                          </div>
                        ))}
                        {torrent.files.length > 5 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            ... and {torrent.files.length - 5} more files
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs">No file information available</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm === torrent.hash && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
              <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                    Remove Torrent
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Are you sure you want to remove "{torrent.name}"?
                    </p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    onClick={() => handleRemove(torrent.hash, true)}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Remove + Delete Files
                  </button>
                  <button
                    onClick={() => handleRemove(torrent.hash, false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Remove Only
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const TorrentRow = ({ torrent }) => {
    const eta = calculateETA(torrent);
    const readyForUpload = isReadyForUpload(torrent);
    
    return (
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center">
            <div className={`mr-3 ${getStatusColor(torrent.status)}`}>
              <StatusIcon status={torrent.status} />
            </div>
            <div className="min-w-0 flex-1">
              <Link
                to={`/torrent/${torrent.hash}`}
                className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate block"
                title={torrent.name}
              >
                {torrent.name}
              </Link>
              <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                {torrent.status}
                {readyForUpload && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Ready for Upload
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="w-full">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{torrent.progress.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(torrent.progress, torrent.status)}`}
                style={{ width: `${Math.min(torrent.progress, 100)}%` }}
              ></div>
            </div>
          </div>
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
          {formatBytes(torrent.size)}
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center">
            <ArrowDownIcon className="w-4 h-4 mr-1 text-green-500" />
            {formatSpeed(torrent.download_rate)}
          </div>
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center">
            <ArrowUpIcon className="w-4 h-4 mr-1 text-blue-500" />
            {formatSpeed(torrent.upload_rate)}
          </div>
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          {eta ? formatTime(eta) : 'Unknown'}
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          {torrent.peers} / {torrent.seeds}
        </td>
        
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex justify-end space-x-2">
            {/* ✅ NEW: Upload button for table view */}
            {readyForUpload && (
              <button
                onClick={() => handleUploadToCloud(torrent.hash)}
                disabled={uploading[torrent.hash]}
                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
                title="Upload to Cloud"
              >
                <CloudArrowUpIcon className="w-5 h-5" />
              </button>
            )}

            {torrent.status === 'seeding' && (
              <button
                onClick={() => handleStopSeeding(torrent.hash)}
                className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
                title="Stop Seeding"
              >
                <StopIcon className="w-5 h-5" />
              </button>
            )}
            
            <button
              onClick={() => handlePauseResume(torrent)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title={torrent.status === 'paused' ? 'Resume' : 'Pause'}
            >
              {torrent.status === 'paused' ? (
                <PlayIcon className="w-5 h-5" />
              ) : (
                <PauseIcon className="w-5 h-5" />
              )}
            </button>
            
            <button
              onClick={() => setShowDeleteConfirm(torrent.hash)}
              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              title="Remove"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </td>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm === torrent.hash && (
          <td colSpan="8">
            <div className="fixed inset-0 z-50 overflow-y-auto">
              <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
                <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                  <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                      Remove Torrent
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Are you sure you want to remove "{torrent.name}"?
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button
                      onClick={() => handleRemove(torrent.hash, true)}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                    >
                      Remove + Delete Files
                    </button>
                    <button
                      onClick={() => handleRemove(torrent.hash, false)}
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    >
                      Remove Only
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(null)}
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </td>
        )}
      </tr>
    );
  };

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {torrents.map((torrent) => (
          <TorrentCard key={torrent.hash} torrent={torrent} />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Progress
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Size
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Down Speed
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Up Speed
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                ETA
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Peers/Seeds
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {torrents.map((torrent) => (
              <TorrentRow key={torrent.hash} torrent={torrent} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TorrentList;