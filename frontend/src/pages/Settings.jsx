import React, { useState, useRef, useCallback, useMemo } from 'react';
import { 
  CogIcon, 
  CloudIcon, 
  ShieldCheckIcon, 
  WifiIcon,
  ComputerDesktopIcon,
  DocumentArrowDownIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useSettings } from '../context/SettingsContext';
import toast from 'react-hot-toast';

// Memoized SettingField component to prevent unnecessary re-renders
const SettingField = React.memo(({ 
  label, 
  description, 
  type = 'text', 
  value, 
  onChange, 
  placeholder,
  options = [],
  min,
  max,
  step,
  disabled = false,
  error = null,
  name // Add name prop for better key management
}) => {
  const handleChange = useCallback((e) => {
    const newValue = type === 'number' ? Number(e.target.value) : 
                    type === 'checkbox' ? e.target.checked : 
                    e.target.value;
    onChange(newValue);
  }, [onChange, type]);

  // Use name or label as key to ensure consistent rendering
  const fieldId = useMemo(() => name || label.toLowerCase().replace(/\s+/g, '_'), [name, label]);

  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      )}
      
      {type === 'select' ? (
        <select
          id={fieldId}
          value={value || ''}
          onChange={handleChange}
          disabled={disabled}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === 'checkbox' ? (
        <div className="flex items-center">
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(value)}
            onChange={handleChange}
            disabled={disabled}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
          />
        </div>
      ) : type === 'textarea' ? (
        <textarea
          id={fieldId}
          value={value || ''}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
        />
      ) : (
        <input
          id={fieldId}
          type={type}
          value={value || ''}
          onChange={handleChange}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
        />
      )}
      
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
});

SettingField.displayName = 'SettingField';

// Memoized CloudProviderStatus component
const CloudProviderStatus = React.memo(({ provider, name, isConfigured }) => {
  return (
    <div className={`flex items-center justify-between p-3 rounded-md ${
      isConfigured 
        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
        : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
    }`}>
      <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>
      <div className="flex items-center">
        {isConfigured ? (
          <>
            <CheckCircleIcon className="w-5 h-5 text-green-500 mr-2" />
            <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
          </>
        ) : (
          <>
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 mr-2" />
            <span className="text-sm text-yellow-600 dark:text-yellow-400">Not configured</span>
          </>
        )}
      </div>
    </div>
  );
});

CloudProviderStatus.displayName = 'CloudProviderStatus';

const Settings = () => {
  const {
    settings,
    loading,
    dirty,
    updateSetting,
    saveSettings,
    resetSettings,
    exportSettings,
    importSettings,
    getValidationErrors,
    isCloudProviderConfigured,
    formatBytes
  } = useSettings();

  const [activeTab, setActiveTab] = useState('general');
  const [validationErrors, setValidationErrors] = useState([]);
  const fileInputRef = useRef(null);

  const tabs = useMemo(() => [
    { id: 'general', name: 'General', icon: CogIcon },
    { id: 'privacy', name: 'Privacy & Security', icon: ShieldCheckIcon },
    { id: 'cloud', name: 'Cloud Storage', icon: CloudIcon },
    { id: 'lan', name: 'LAN Sync', icon: WifiIcon },
    { id: 'advanced', name: 'Advanced', icon: ComputerDesktopIcon },
  ], []);

  const handleSave = useCallback(async () => {
    try {
      const errors = getValidationErrors();
      if (errors.length > 0) {
        setValidationErrors(errors);
        toast.error('Please fix validation errors before saving');
        return;
      }

      await saveSettings();
      setValidationErrors([]);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [getValidationErrors, saveSettings]);

  const handleReset = useCallback(async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      try {
        await resetSettings();
        setValidationErrors([]);
        toast.success('Settings reset to defaults');
      } catch (error) {
        console.error('Failed to reset settings:', error);
      }
    }
  }, [resetSettings]);

  const handleImportSettings = useCallback(async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        await importSettings(file);
        setValidationErrors([]);
      } catch (error) {
        console.error('Failed to import settings:', error);
      }
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [importSettings]);

  // Memoize setting update handlers to prevent re-creation on every render
  const createUpdateHandler = useCallback((key) => {
    return (value) => updateSetting(key, value);
  }, [updateSetting]);

  // Memoize cloud provider configurations
  const cloudProviderConfigs = useMemo(() => ({
    gdrive: isCloudProviderConfigured('gdrive'),
    s3: isCloudProviderConfigured('s3'),
    webdav: isCloudProviderConfigured('webdav')
  }), [isCloudProviderConfigured]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Configure your torrent client preferences and integrations
          </p>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-2" />
              <div>
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Validation Errors
                </h3>
                <ul className="mt-2 text-sm text-red-700 dark:text-red-300 list-disc list-inside">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg">
          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
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

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Download Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      name="download_path"
                      label="Download Path"
                      description="Default location for downloaded files"
                      value={settings.download_path}
                      onChange={createUpdateHandler('download_path')}
                      placeholder="./downloads"
                    />
                    
                    <SettingField
                      name="max_download_rate"
                      label="Max Download Rate (KB/s)"
                      description="0 = unlimited"
                      type="number"
                      value={settings.max_download_rate}
                      onChange={createUpdateHandler('max_download_rate')}
                      min={0}
                    />
                    
                    <SettingField
                      name="max_upload_rate"
                      label="Max Upload Rate (KB/s)"
                      description="0 = unlimited"
                      type="number"
                      value={settings.max_upload_rate}
                      onChange={createUpdateHandler('max_upload_rate')}
                      min={0}
                    />
                    
                    <SettingField
                      name="max_connections"
                      label="Max Connections"
                      description="Maximum number of peer connections"
                      type="number"
                      value={settings.max_connections}
                      onChange={createUpdateHandler('max_connections')}
                      min={1}
                      max={1000}
                    />
                    
                    <SettingField
                      name="max_uploads"
                      label="Max Upload Slots"
                      description="Maximum concurrent uploads"
                      type="number"
                      value={settings.max_uploads}
                      onChange={createUpdateHandler('max_uploads')}
                      min={1}
                      max={100}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    UI Preferences
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      name="theme"
                      label="Theme"
                      description="Select the theme for the app"
                      type="select"
                      value={settings.theme}
                      onChange={createUpdateHandler('theme')}
                      options={[
                        { value: 'light', label: 'Light' },
                        { value: 'dark', label: 'Dark' },
                        { value: 'auto', label: 'Auto (System)' }
                      ]}
                    />
                    
                    <SettingField
                      name="auto_refresh_interval"
                      label="Auto Refresh Interval (ms)"
                      description="How often to update the interface"
                      type="number"
                      value={settings.auto_refresh_interval}
                      onChange={createUpdateHandler('auto_refresh_interval')}
                      min={500}
                      max={10000}
                      step={500}
                    />
                    
                    <SettingField
                      name="enable_notifications"
                      label="Enable Notifications"
                      description="Show toast notifications for events"
                      type="checkbox"
                      value={settings.enable_notifications}
                      onChange={createUpdateHandler('enable_notifications')}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Proxy Settings
                  </h3>
                  <div className="space-y-4">
                    <SettingField
                      name="use_proxy"
                      label="Use Proxy"
                      description="Route torrent traffic through a proxy server"
                      type="checkbox"
                      value={settings.use_proxy}
                      onChange={createUpdateHandler('use_proxy')}
                    />
                    
                    {settings.use_proxy && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-6">
                        <SettingField
                          name="proxy_type"
                          label="Proxy Type"
                          type="select"
                          value={settings.proxy_type}
                          onChange={createUpdateHandler('proxy_type')}
                          options={[
                            { value: 'socks5', label: 'SOCKS5' },
                            { value: 'http', label: 'HTTP' }
                          ]}
                        />
                        
                        <SettingField
                          name="proxy_host"
                          label="Proxy Host"
                          value={settings.proxy_host}
                          onChange={createUpdateHandler('proxy_host')}
                          placeholder="127.0.0.1"
                        />
                        
                        <SettingField
                          name="proxy_port"
                          label="Proxy Port"
                          type="number"
                          value={settings.proxy_port}
                          onChange={createUpdateHandler('proxy_port')}
                          min={1}
                          max={65535}
                        />
                        
                        <SettingField
                          name="proxy_username"
                          label="Username (Optional)"
                          value={settings.proxy_username}
                          onChange={createUpdateHandler('proxy_username')}
                        />
                        
                        <SettingField
                          name="proxy_password"
                          label="Password (Optional)"
                          type="password"
                          value={settings.proxy_password}
                          onChange={createUpdateHandler('proxy_password')}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Encryption
                  </h3>
                  <div className="space-y-4">
                    <SettingField
                      name="enable_encryption"
                      label="Enable Encryption"
                      description="Encrypt downloaded files with a secret key"
                      type="checkbox"
                      value={settings.enable_encryption}
                      onChange={createUpdateHandler('enable_encryption')}
                    />
                    
                    {settings.enable_encryption && (
                      <SettingField
                        name="encryption_key"
                        label="Encryption Key"
                        description="Secret key for file encryption (keep this safe!)"
                        type="password"
                        value={settings.encryption_key}
                        onChange={createUpdateHandler('encryption_key')}
                        placeholder="Enter a strong encryption key"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'cloud' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Cloud Provider Status
                  </h3>
                  <div className="space-y-3">
                    <CloudProviderStatus 
                      provider="gdrive" 
                      name="Google Drive" 
                      isConfigured={cloudProviderConfigs.gdrive}
                    />
                    <CloudProviderStatus 
                      provider="s3" 
                      name="Amazon S3" 
                      isConfigured={cloudProviderConfigs.s3}
                    />
                    <CloudProviderStatus 
                      provider="webdav" 
                      name="WebDAV" 
                      isConfigured={cloudProviderConfigs.webdav}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Google Drive
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                    <SettingField
                      name="gdrive_credentials_path"
                      label="Credentials File Path"
                      description="Path to Google Drive OAuth2 credentials JSON file"
                      value={settings.gdrive_credentials_path}
                      onChange={createUpdateHandler('gdrive_credentials_path')}
                      placeholder="./credentials/gdrive_credentials.json"
                    />
                    
                    <SettingField
                      name="gdrive_folder_id"
                      label="Folder ID (Optional)"
                      description="Google Drive folder ID to upload to (leave empty for root)"
                      value={settings.gdrive_folder_id}
                      onChange={createUpdateHandler('gdrive_folder_id')}
                      placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Amazon S3
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      name="s3_access_key"
                      label="Access Key"
                      value={settings.s3_access_key}
                      onChange={createUpdateHandler('s3_access_key')}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                    />
                    
                    <SettingField
                      name="s3_secret_key"
                      label="Secret Key"
                      type="password"
                      value={settings.s3_secret_key}
                      onChange={createUpdateHandler('s3_secret_key')}
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    />
                    
                    <SettingField
                      name="s3_bucket"
                      label="Bucket Name"
                      value={settings.s3_bucket}
                      onChange={createUpdateHandler('s3_bucket')}
                      placeholder="my-torrent-bucket"
                    />
                    
                    <SettingField
                      name="s3_region"
                      label="Region"
                      value={settings.s3_region}
                      onChange={createUpdateHandler('s3_region')}
                      placeholder="us-east-1"
                    />
                    
                    <SettingField
                      name="s3_endpoint_url"
                      label="Endpoint URL (Optional)"
                      description="For S3-compatible services like DigitalOcean Spaces"
                      value={settings.s3_endpoint_url}
                      onChange={createUpdateHandler('s3_endpoint_url')}
                      placeholder="https://nyc3.digitaloceanspaces.com"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    WebDAV
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      name="webdav_url"
                      label="WebDAV URL"
                      description="Full URL to your WebDAV server (Tailnet URL also works)"
                      value={settings.webdav_url}
                      onChange={createUpdateHandler('webdav_url')}
                      placeholder="https://cloud.example.com/remote.php/dav/files/username/"
                    />
                    
                    <SettingField
                      name="webdav_username"
                      label="Username"
                      description="Username for WebDAV authentication"
                      value={settings.webdav_username}
                      onChange={createUpdateHandler('webdav_username')}
                      placeholder="your-username"
                    />
                    
                    <SettingField
                      name="webdav_password"
                      label="Password"
                      description="Password for WebDAV authentication"
                      type="password"
                      value={settings.webdav_password}
                      onChange={createUpdateHandler('webdav_password')}
                      placeholder="your-password"
                    />
                    
                    <SettingField
                      name="webdav_root_path"
                      label="Root Path"
                      description="Upload directory on WebDAV server"
                      value={settings.webdav_root_path}
                      onChange={createUpdateHandler('webdav_root_path')}
                      placeholder="/torrents"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'lan' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    LAN Sync Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      name="lan_sync_enabled"
                      label="Enable LAN Sync"
                      description="Allow discovery and sharing with local devices"
                      type="checkbox"
                      value={settings.lan_sync_enabled}
                      onChange={createUpdateHandler('lan_sync_enabled')}
                    />
                    
                    <SettingField
                      name="device_name"
                      label="Device Name"
                      description="How this device appears to others"
                      value={settings.device_name}
                      onChange={createUpdateHandler('device_name')}
                      placeholder="Hybrid Torrent Client"
                    />
                    
                    <SettingField
                      name="lan_sync_port"
                      label="LAN Sync Port"
                      description="Port for LAN communication"
                      type="number"
                      value={settings.lan_sync_port}
                      onChange={createUpdateHandler('lan_sync_port')}
                      min={1024}
                      max={65535}
                    />
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    How LAN Sync Works
                  </h4>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• Devices automatically discover each other using mDNS/Zeroconf</li>
                    <li>• Only completed torrents are shared between devices</li>
                    <li>• Files are transferred directly over your local network</li>
                    <li>• No internet connection required for local transfers</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Torrent Engine Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      name="listen_port_min"
                      label="Listen Port Range (Min)"
                      type="number"
                      value={settings.listen_port_min}
                      onChange={createUpdateHandler('listen_port_min')}
                      min={1024}
                      max={65535}
                    />
                    
                    <SettingField
                      name="listen_port_max"
                      label="Listen Port Range (Max)"
                      type="number"
                      value={settings.listen_port_max}
                      onChange={createUpdateHandler('listen_port_max')}
                      min={1024}
                      max={65535}
                    />
                    
                    <SettingField
                      name="enable_dht"
                      label="Enable DHT"
                      description="Distributed Hash Table for peer discovery"
                      type="checkbox"
                      value={settings.enable_dht}
                      onChange={createUpdateHandler('enable_dht')}
                    />
                    
                    <SettingField
                      name="enable_lsd"
                      label="Enable Local Service Discovery"
                      description="Find peers on local network"
                      type="checkbox"
                      value={settings.enable_lsd}
                      onChange={createUpdateHandler('enable_lsd')}
                    />
                    
                    <SettingField
                      name="enable_upnp"
                      label="Enable UPnP"
                      description="Automatic port forwarding"
                      type="checkbox"
                      value={settings.enable_upnp}
                      onChange={createUpdateHandler('enable_upnp')}
                    />
                    
                    <SettingField
                      name="enable_natpmp"
                      label="Enable NAT-PMP"
                      description="Alternative port forwarding protocol"
                      type="checkbox"
                      value={settings.enable_natpmp}
                      onChange={createUpdateHandler('enable_natpmp')}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Logging
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      name="log_level"
                      label="Log Level"
                      description="Controls the verbosity of logs"
                      type="select"
                      value={settings.log_level}
                      onChange={createUpdateHandler('log_level')}
                      options={[
                        { value: 'DEBUG', label: 'Debug' },
                        { value: 'INFO', label: 'Info' },
                        { value: 'WARNING', label: 'Warning' },
                        { value: 'ERROR', label: 'Error' },
                        { value: 'CRITICAL', label: 'Critical' }
                      ]}
                    />
                    
                    <SettingField
                      name="log_file"
                      label="Log File Path (Optional)"
                      description="Leave empty to log to console only"
                      value={settings.log_file}
                      onChange={createUpdateHandler('log_file')}
                      placeholder="./logs/torrent.log"
                    />
                    
                    <SettingField
                      name="max_log_size_display"
                      label="Max Log File Size"
                      description="Maximum size before rotation"
                      value={formatBytes(settings.max_log_size || 0)}
                      disabled={true}
                    />
                    
                    <SettingField
                      name="log_backup_count"
                      label="Log Backup Count"
                      description="Number of old log files to keep"
                      type="number"
                      value={settings.log_backup_count}
                      onChange={createUpdateHandler('log_backup_count')}
                      min={0}
                      max={50}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Import/Export Settings
                  </h3>
                  <div className="flex space-x-4">
                    <button
                      onClick={exportSettings}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
                      Export Settings
                    </button>
                    
                    <label className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer">
                      <DocumentArrowUpIcon className="w-4 h-4 mr-2" />
                      Import Settings
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportSettings}
                        ref={fileInputRef}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {dirty ? 'You have unsaved changes' : 'All changes saved'}
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleReset}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Reset to Defaults
                </button>
                
                <button
                  onClick={handleSave}
                  disabled={loading || !dirty}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;