import React, { useState, useEffect } from 'react';
import { 
  WifiIcon, 
  ComputerDesktopIcon, 
  ArrowDownTrayIcon,
  SignalIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  FolderArrowDownIcon
} from '@heroicons/react/24/outline';
import { lanAPI } from '../services/api';
import { useTorrents } from '../context/TorrentContext';
import { useSettings } from '../context/SettingsContext';
import toast from 'react-hot-toast';

const LANSync = () => {
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pullingTorrents, setPullingTorrents] = useState({});
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [peerTorrents, setPeerTorrents] = useState({});
  
  const { torrents, formatBytes } = useTorrents();
  const { getSetting } = useSettings();

  const lanSyncEnabled = getSetting('lan_sync_enabled', true);
  const deviceName = getSetting('device_name', 'Hybrid Torrent Client');

  useEffect(() => {
    if (lanSyncEnabled) {
      loadPeers();
      const interval = setInterval(loadPeers, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [lanSyncEnabled]);

  const loadPeers = async () => {
    try {
      setLoading(true);
      const discoveredPeers = await lanAPI.getPeers();
      setPeers(discoveredPeers);
      
      // Load torrents for each peer
      for (const peer of discoveredPeers) {
        if (peer.available_torrents && peer.available_torrents.length > 0) {
          try {
            const torrents = await lanAPI.getPeerTorrents(peer.id);
            setPeerTorrents(prev => ({ ...prev, [peer.id]: torrents }));
          } catch (error) {
            console.error(`Failed to load torrents for peer ${peer.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load peers:', error);
      toast.error('Failed to discover LAN peers');
    } finally {
      setLoading(false);
    }
  };

  const handlePullTorrent = async (peerId, torrentHash) => {
    const pullKey = `${peerId}-${torrentHash}`;
    setPullingTorrents(prev => ({ ...prev, [pullKey]: true }));

    try {
      const result = await lanAPI.pullFromPeer(peerId, torrentHash);
      toast.success(`Started downloading from peer: ${result.torrent_name || 'Unknown'}`);
    } catch (error) {
      console.error('Failed to pull torrent:', error);
      toast.error(`Failed to download: ${error.message}`);
    } finally {
      setPullingTorrents(prev => ({ ...prev, [pullKey]: false }));
    }
  };

  const pingPeer = async (peerId) => {
    try {
      const isOnline = await lanAPI.pingPeer(peerId);
      toast.success(isOnline ? 'Peer is online' : 'Peer is offline');
      if (isOnline) {
        loadPeers(); // Refresh peer list
      }
    } catch (error) {
      console.error('Failed to ping peer:', error);
      toast.error('Failed to ping peer');
    }
  };

  const getTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const PeerCard = ({ peer }) => {
    const isSelected = selectedPeer === peer.id;
    const torrentsForPeer = peerTorrents[peer.id] || [];
    const lastSeenAgo = getTimeAgo(peer.last_seen);
    const isRecentlyActive = new Date() - new Date(peer.last_seen) < 300000; // 5 minutes

    return (
      <div 
        className={`bg-white dark:bg-gray-800 rounded-lg border ${
          isSelected 
            ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800' 
            : 'border-gray-200 dark:border-gray-700'
        } p-4 cursor-pointer transition-all hover:shadow-md`}
        onClick={() => setSelectedPeer(isSelected ? null : peer.id)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <div className={`p-2 rounded-md mr-3 ${
              isRecentlyActive 
                ? 'bg-green-100 dark:bg-green-900/30' 
                : 'bg-gray-100 dark:bg-gray-700'
            }`}>
              <ComputerDesktopIcon className={`w-6 h-6 ${
                isRecentlyActive 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-gray-500 dark:text-gray-400'
              }`} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                {peer.name}
              </h3>
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{peer.ip_address}:{peer.port}</span>
                <span className="mx-2">•</span>
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-1 ${
                    isRecentlyActive ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span>{lastSeenAgo}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
              {peer.available_torrents?.length || 0} torrents
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                pingPeer(peer.id);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              title="Ping peer"
            >
              <SignalIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        {isSelected && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Available Torrents
            </h4>
            {torrentsForPeer.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No torrents available or failed to load torrent information.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {torrentsForPeer.map((torrent, index) => {
                  const pullKey = `${peer.id}-${torrent.hash}`;
                  const isPulling = pullingTorrents[pullKey];
                  const alreadyHave = torrents.some(t => t.hash === torrent.hash);

                  return (
                    <div 
                      key={torrent.hash || index}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
                    >
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {torrent.name || `Torrent ${index + 1}`}
                        </h5>
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {torrent.size && (
                            <>
                              <span>{formatBytes(torrent.size)}</span>
                              <span className="mx-2">•</span>
                            </>
                          )}
                          <span className="capitalize">{torrent.status || 'Unknown'}</span>
                          {alreadyHave && (
                            <>
                              <span className="mx-2">•</span>
                              <span className="text-green-600 dark:text-green-400">Already have</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handlePullTorrent(peer.id, torrent.hash)}
                        disabled={isPulling || alreadyHave || !torrent.hash}
                        className="ml-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPulling ? (
                          <>
                            <div className="animate-spin -ml-1 mr-1 h-3 w-3 border border-white border-t-transparent rounded-full"></div>
                            Pulling...
                          </>
                        ) : alreadyHave ? (
                          'Have'
                        ) : (
                          <>
                            <ArrowDownTrayIcon className="w-3 h-3 mr-1" />
                            Pull
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!lanSyncEnabled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              LAN Sync Disabled
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Enable LAN sync in settings to discover and share torrents with devices on your local network.
            </p>
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/settings'}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                LAN Sync
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Discover and share torrents with devices on your local network
              </p>
            </div>
            <button
              onClick={loadPeers}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full"></div>
                  Scanning...
                </>
              ) : (
                <>
                  <WifiIcon className="w-4 h-4 mr-2" />
                  Refresh
                </>
              )}
            </button>
          </div>
        </div>

        {/* Device Info */}
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center">
            <ComputerDesktopIcon className="w-6 h-6 text-blue-600 dark:text-blue-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                This Device: {deviceName}
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Sharing {torrents.filter(t => t.status === 'completed').length} completed torrents
              </p>
            </div>
          </div>
        </div>

        {/* Peers List */}
        {loading && peers.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Scanning for devices on your network...
              </p>
            </div>
          </div>
        ) : peers.length === 0 ? (
          <div className="text-center py-12">
            <WifiIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              No devices discovered
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Make sure other devices with Hybrid Torrent Client are running on your network.
            </p>
            <div className="mt-6">
              <button
                onClick={loadPeers}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <WifiIcon className="w-4 h-4 mr-2" />
                Scan Again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                Discovered Devices ({peers.length})
              </h2>
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                <ClockIcon className="w-4 h-4 mr-1" />
                <span>Auto-refresh every 10 seconds</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {peers.map(peer => (
                <PeerCard key={peer.id} peer={peer} />
              ))}
            </div>
          </>
        )}

        {/* Help Text */}
        <div className="mt-8 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            How LAN Sync Works
          </h3>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>• Devices automatically discover each other using mDNS/Zeroconf</li>
            <li>• Only completed torrents are shared between devices</li>
            <li>• Files are transferred directly over your local network</li>
            <li>• No internet connection required for local transfers</li>
            <li>• All transfers are secured and authenticated</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default LANSync;