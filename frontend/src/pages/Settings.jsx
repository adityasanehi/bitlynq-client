import React, { useState, useRef } from 'react';
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
    validateSettings,
    getValidationErrors,
    isCloudProviderConfigured,
    formatBytes
  } = useSettings();

  const [activeTab, setActiveTab] = useState('general');
  const [validationErrors, setValidationErrors] = useState([]);
  const fileInputRef = useRef(null);

  const tabs = [
    { id: 'general', name: 'General', icon: CogIcon },
    { id: 'privacy', name: 'Privacy & Security', icon: ShieldCheckIcon },
    { id: 'cloud', name: 'Cloud Storage', icon: CloudIcon },
    { id: 'lan', name: 'LAN Sync', icon: WifiIcon },
    { id: 'advanced', name: 'Advanced', icon: ComputerDesktopIcon },
  ];

  const handleSave = async () => {
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
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      try {
        await resetSettings();
        setValidationErrors([]);
        toast.success('Settings reset to defaults');
      } catch (error) {
        console.error('Failed to reset settings:', error);
      }
    }
  };

  const handleImportSettings = async (event) => {
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
  };

  const SettingField = ({ 
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
    error = null
  }) => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      )}
      
      {type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
          />
        </div>
      ) : type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
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

  const CloudProviderStatus = ({ provider, name }) => {
    const configured = isCloudProviderConfigured(provider);
    return (
      <div className={`flex items-center justify-between p-3 rounded-md ${
        configured 
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
          : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
      }`}>
        <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>
        <div className="flex items-center">
          {configured ? (
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
  };

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
                      label="Download Path"
                      description="Default location for downloaded files"
                      value={settings.download_path}
                      onChange={(value) => updateSetting('download_path', value)}
                      placeholder="./downloads"
                    />
                    
                    <SettingField
                      label="Max Download Rate (KB/s)"
                      description="0 = unlimited"
                      type="number"
                      value={settings.max_download_rate}
                      onChange={(value) => updateSetting('max_download_rate', value)}
                      min={0}
                    />
                    
                    <SettingField
                      label="Max Upload Rate (KB/s)"
                      description="0 = unlimited"
                      type="number"
                      value={settings.max_upload_rate}
                      onChange={(value) => updateSetting('max_upload_rate', value)}
                      min={0}
                    />
                    
                    <SettingField
                      label="Max Connections"
                      description="Maximum number of peer connections"
                      type="number"
                      value={settings.max_connections}
                      onChange={(value) => updateSetting('max_connections', value)}
                      min={1}
                      max={1000}
                    />
                    
                    <SettingField
                      label="Max Upload Slots"
                      description="Maximum concurrent uploads"
                      type="number"
                      value={settings.max_uploads}
                      onChange={(value) => updateSetting('max_uploads', value)}
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
                      label="Theme"
                      type="select"
                      value={settings.theme}
                      onChange={(value) => updateSetting('theme', value)}
                      options={[
                        { value: 'light', label: 'Light' },
                        { value: 'dark', label: 'Dark' },
                        { value: 'auto', label: 'Auto (System)' }
                      ]}
                    />
                    
                    <SettingField
                      label="Auto Refresh Interval (ms)"
                      description="How often to update the interface"
                      type="number"
                      value={settings.auto_refresh_interval}
                      onChange={(value) => updateSetting('auto_refresh_interval', value)}
                      min={500}
                      max={10000}
                      step={500}
                    />
                    
                    <SettingField
                      label="Enable Notifications"
                      description="Show toast notifications for events"
                      type="checkbox"
                      value={settings.enable_notifications}
                      onChange={(value) => updateSetting('enable_notifications', value)}
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
                      label="Use Proxy"
                      description="Route torrent traffic through a proxy server"
                      type="checkbox"
                      value={settings.use_proxy}
                      onChange={(value) => updateSetting('use_proxy', value)}
                    />
                    
                    {settings.use_proxy && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-6">
                        <SettingField
                          label="Proxy Type"
                          type="select"
                          value={settings.proxy_type}
                          onChange={(value) => updateSetting('proxy_type', value)}
                          options={[
                            { value: 'socks5', label: 'SOCKS5' },
                            { value: 'http', label: 'HTTP' }
                          ]}
                        />
                        
                        <SettingField
                          label="Proxy Host"
                          value={settings.proxy_host}
                          onChange={(value) => updateSetting('proxy_host', value)}
                          placeholder="127.0.0.1"
                        />
                        
                        <SettingField
                          label="Proxy Port"
                          type="number"
                          value={settings.proxy_port}
                          onChange={(value) => updateSetting('proxy_port', value)}
                          min={1}
                          max={65535}
                        />
                        
                        <SettingField
                          label="Username (Optional)"
                          value={settings.proxy_username}
                          onChange={(value) => updateSetting('proxy_username', value)}
                        />
                        
                        <SettingField
                          label="Password (Optional)"
                          type="password"
                          value={settings.proxy_password}
                          onChange={(value) => updateSetting('proxy_password', value)}
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
                      label="Enable Encryption"
                      description="Encrypt downloaded files with a secret key"
                      type="checkbox"
                      value={settings.enable_encryption}
                      onChange={(value) => updateSetting('enable_encryption', value)}
                    />
                    
                    {settings.enable_encryption && (
                      <SettingField
                        label="Encryption Key"
                        description="Secret key for file encryption (keep this safe!)"
                        type="password"
                        value={settings.encryption_key}
                        onChange={(value) => updateSetting('encryption_key', value)}
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
                    <CloudProviderStatus provider="gdrive" name="Google Drive" />
                    <CloudProviderStatus provider="s3" name="Amazon S3" />
                    <CloudProviderStatus provider="webdav" name="WebDAV" />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Google Drive
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                    <SettingField
                      label="Credentials File Path"
                      description="Path to Google Drive OAuth2 credentials JSON file"
                      value={settings.gdrive_credentials_path}
                      onChange={(value) => updateSetting('gdrive_credentials_path', value)}
                      placeholder="./credentials/gdrive_credentials.json"
                    />
                    
                    <SettingField
                      label="Folder ID (Optional)"
                      description="Google Drive folder ID to upload to (leave empty for root)"
                      value={settings.gdrive_folder_id}
                      onChange={(value) => updateSetting('gdrive_folder_id', value)}
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
                      label="Access Key"
                      value={settings.s3_access_key}
                      onChange={(value) => updateSetting('s3_access_key', value)}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                    />
                    
                    <SettingField
                      label="Secret Key"
                      type="password"
                      value={settings.s3_secret_key}
                      onChange={(value) => updateSetting('s3_secret_key', value)}
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    />
                    
                    <SettingField
                      label="Bucket Name"
                      value={settings.s3_bucket}
                      onChange={(value) => updateSetting('s3_bucket', value)}
                      placeholder="my-torrent-bucket"
                    />
                    
                    <SettingField
                      label="Region"
                      value={settings.s3_region}
                      onChange={(value) => updateSetting('s3_region', value)}
                      placeholder="us-east-1"
                    />
                    
                    <SettingField
                      label="Endpoint URL (Optional)"
                      description="For S3-compatible services like DigitalOcean Spaces"
                      value={settings.s3_endpoint_url}
                      onChange={(value) => updateSetting('s3_endpoint_url', value)}
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
                      label="WebDAV URL"
                      value={settings.webdav_url}
                      onChange={(value) => updateSetting('webdav_url', value)}
                      placeholder="https://cloud.example.com/remote.php/dav/files/username/"
                    />
                    
                    <SettingField
                      label="Username"
                      value={settings.webdav_username}
                      onChange={(value) => updateSetting('webdav_username', value)}
                      placeholder="your-username"
                    />
                    
                    <SettingField
                      label="Password"
                      type="password"
                      value={settings.webdav_password}
                      onChange={(value) => updateSetting('webdav_password', value)}
                      placeholder="your-password"
                    />
                    
                    <SettingField
                      label="Root Path"
                      description="Upload directory on WebDAV server"
                      value={settings.webdav_root_path}
                      onChange={(value) => updateSetting('webdav_root_path', value)}
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
                      label="Enable LAN Sync"
                      description="Allow discovery and sharing with local devices"
                      type="checkbox"
                      value={settings.lan_sync_enabled}
                      onChange={(value) => updateSetting('lan_sync_enabled', value)}
                    />
                    
                    <SettingField
                      label="Device Name"
                      description="How this device appears to others"
                      value={settings.device_name}
                      onChange={(value) => updateSetting('device_name', value)}
                      placeholder="Hybrid Torrent Client"
                    />
                    
                    <SettingField
                      label="LAN Sync Port"
                      description="Port for LAN communication"
                      type="number"
                      value={settings.lan_sync_port}
                      onChange={(value) => updateSetting('lan_sync_port', value)}
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
                      label="Listen Port Range (Min)"
                      type="number"
                      value={settings.listen_port_min}
                      onChange={(value) => updateSetting('listen_port_min', value)}
                      min={1024}
                      max={65535}
                    />
                    
                    <SettingField
                      label="Listen Port Range (Max)"
                      type="number"
                      value={settings.listen_port_max}
                      onChange={(value) => updateSetting('listen_port_max', value)}
                      min={1024}
                      max={65535}
                    />
                    
                    <SettingField
                      label="Enable DHT"
                      description="Distributed Hash Table for peer discovery"
                      type="checkbox"
                      value={settings.enable_dht}
                      onChange={(value) => updateSetting('enable_dht', value)}
                    />
                    
                    <SettingField
                      label="Enable Local Service Discovery"
                      description="Find peers on local network"
                      type="checkbox"
                      value={settings.enable_lsd}
                      onChange={(value) => updateSetting('enable_lsd', value)}
                    />
                    
                    <SettingField
                      label="Enable UPnP"
                      description="Automatic port forwarding"
                      type="checkbox"
                      value={settings.enable_upnp}
                      onChange={(value) => updateSetting('enable_upnp', value)}
                    />
                    
                    <SettingField
                      label="Enable NAT-PMP"
                      description="Alternative port forwarding protocol"
                      type="checkbox"
                      value={settings.enable_natpmp}
                      onChange={(value) => updateSetting('enable_natpmp', value)}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Logging
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SettingField
                      label="Log Level"
                      type="select"
                      value={settings.log_level}
                      onChange={(value) => updateSetting('log_level', value)}
                      options={[
                        { value: 'DEBUG', label: 'Debug' },
                        { value: 'INFO', label: 'Info' },
                        { value: 'WARNING', label: 'Warning' },
                        { value: 'ERROR', label: 'Error' },
                        { value: 'CRITICAL', label: 'Critical' }
                      ]}
                    />
                    
                    <SettingField
                      label="Log File Path (Optional)"
                      description="Leave empty to log to console only"
                      value={settings.log_file}
                      onChange={(value) => updateSetting('log_file', value)}
                      placeholder="./logs/torrent.log"
                    />
                    
                    <SettingField
                      label="Max Log File Size"
                      description="Maximum size before rotation"
                      value={formatBytes(settings.max_log_size)}
                      disabled={true}
                    />
                    
                    <SettingField
                      label="Log Backup Count"
                      description="Number of old log files to keep"
                      type="number"
                      value={settings.log_backup_count}
                      onChange={(value) => updateSetting('log_backup_count', value)}
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