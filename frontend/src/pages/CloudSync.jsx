import React, { useState, useEffect } from 'react';
import { 
  CloudIcon, 
  CloudArrowUpIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { useTorrents } from '../context/TorrentContext';
import { useSettings } from '../context/SettingsContext';
import { cloudAPI } from '../services/api';
import toast from 'react-hot-toast';

const CloudSync = () => {
  const { torrents, getTorrentsByStatus, formatBytes } = useTorrents();
  const { settings, isCloudProviderConfigured, getConfiguredCloudProviders } = useSettings();
  
  const [uploadHistory, setUploadHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('gdrive');
  const [activeTab, setActiveTab] = useState('upload');

  const completedTorrents = getTorrentsByStatus('completed');
  const configuredProviders = getConfiguredCloudProviders();

  useEffect(() => {
    loadUploadHistory();
  }, []);

  useEffect(() => {
    if (configuredProviders.length > 0 && !configuredProviders.includes(selectedProvider)) {
      setSelectedProvider(configuredProviders[0]);
    }
  }, [configuredProviders, selectedProvider]);

  const loadUploadHistory = async () => {
    try {
      setLoading(true);
      const history = await cloudAPI.getUploadHistory();
      setUploadHistory(history);
    } catch (error) {
      console.error('Failed to load upload history:', error);
      toast.error('Failed to load upload history');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (torrentHash) => {
    if (!isCloudProviderConfigured(selectedProvider)) {
      toast.error(`${selectedProvider.toUpperCase()} is not configured. Please check settings.`);
      return;
    }

    setUploading(prev => ({ ...prev, [torrentHash]: true }));

    try {
      const result = await cloudAPI.uploadToCloud(torrentHash, selectedProvider);
      toast.success(`Upload started to ${selectedProvider.toUpperCase()}`);
      
      // Refresh upload history
      await loadUploadHistory();
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(prev => ({ ...prev, [torrentHash]: false }));
    }
  };

  const getProviderIcon = (provider) => {
    switch (provider) {
      case 'gdrive':
        return '📁';
      case 's3':
        return '☁️';
      case 'webdav':
        return '🌐';
      default:
        return '☁️';
    }
  };

  const getProviderName = (provider) => {
    switch (provider) {
      case 'gdrive':
        return 'Google Drive';
      case 's3':
        return 'Amazon S3';
      case 'webdav':
        return 'WebDAV';
      default:
        return provider.toUpperCase();
    }
  };

  const CloudProviderCard = ({ provider, configured }) => (
    <div className={`p-4 rounded-lg border ${
      configured 
        ? 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20' 
        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-2xl mr-3">{getProviderIcon(provider)}</span>
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {getProviderName(provider)}
            </h3>
            <p className={`text-xs ${
              configured 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {configured ? 'Configured' : 'Not configured'}
            </p>
          </div>
        </div>
        {configured ? (
          <CheckCircleIcon className="w-5 h-5 text-green-500" />
        ) : (
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
        )}
      </div>
    </div>
  );

  const TorrentUploadCard = ({ torrent }) => {
    const isUploading = uploading[torrent.hash];
    const hasBeenUploaded = uploadHistory.some(upload => upload.torrent_hash === torrent.hash);

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {torrent.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {formatBytes(torrent.size)} • Completed {new Date(torrent.completed_time).toLocaleDateString()}
            </p>
            {hasBeenUploaded && (
              <div className="flex items-center mt-2">
                <CheckCircleIcon className="w-4 h-4 text-green-500 mr-1" />
                <span className="text-xs text-green-600 dark:text-green-400">
                  Previously uploaded
                </span>
              </div>
            )}
          </div>
          
          <div className="ml-4 flex-shrink-0">
            {configuredProviders.length > 0 ? (
              <button
                onClick={() => handleUpload(torrent.hash)}
                disabled={isUploading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <CloudArrowUpIcon className="w-4 h-4 mr-2" />
                    Upload
                  </>
                )}
              </button>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                No providers configured
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const UploadHistoryCard = ({ upload }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {upload.torrent_name || 'Unknown torrent'}
          </h3>
          <div className="flex items-center mt-1">
            <span className="text-2xl mr-2">{getProviderIcon(upload.provider)}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {getProviderName(upload.provider)}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Uploaded {new Date(upload.upload_time).toLocaleString()}
            {upload.file_size && ` • ${formatBytes(upload.file_size)}`}
          </p>
        </div>
        
        <div className="ml-4 flex-shrink-0">
          {upload.upload_url && (
            <a
              href={upload.upload_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              View
            </a>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Cloud Sync
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Upload completed torrents to your cloud storage providers
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/settings'}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Cog6ToothIcon className="w-4 h-4 mr-2" />
              Configure Providers
            </button>
          </div>
        </div>

        {/* Cloud Providers Status */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Cloud Providers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CloudProviderCard provider="gdrive" configured={isCloudProviderConfigured('gdrive')} />
            <CloudProviderCard provider="s3" configured={isCloudProviderConfigured('s3')} />
            <CloudProviderCard provider="webdav" configured={isCloudProviderConfigured('webdav')} />
          </div>
        </div>

        {/* Provider Selection */}
        {configuredProviders.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Upload Destination
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {configuredProviders.map(provider => (
                <option key={provider} value={provider}>
                  {getProviderIcon(provider)} {getProviderName(provider)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('upload')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'upload'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <CloudArrowUpIcon className="w-5 h-5 inline mr-2" />
                Upload ({completedTorrents.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <CloudIcon className="w-5 h-5 inline mr-2" />
                History ({uploadHistory.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'upload' ? (
          <div>
            {completedTorrents.length === 0 ? (
              <div className="text-center py-12">
                <CloudIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  No completed torrents
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Complete some downloads first to upload them to cloud storage.
                </p>
              </div>
            ) : configuredProviders.length === 0 ? (
              <div className="text-center py-12">
                <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-yellow-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  No cloud providers configured
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Configure at least one cloud provider in settings to start uploading.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => window.location.href = '/settings'}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Configure Providers
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {completedTorrents.map(torrent => (
                  <TorrentUploadCard key={torrent.hash} torrent={torrent} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : uploadHistory.length === 0 ? (
              <div className="text-center py-12">
                <CloudIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  No upload history
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Upload some torrents to see your history here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {uploadHistory.map(upload => (
                  <UploadHistoryCard key={upload.id} upload={upload} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudSync;