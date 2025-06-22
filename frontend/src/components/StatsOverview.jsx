import React from 'react';
import { 
  ArrowDownIcon, 
  ArrowUpIcon, 
  ChartBarIcon,
  CloudIcon,
  PauseIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

const StatsOverview = ({ stats }) => {
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const statCards = [
    {
      title: 'Total Torrents',
      value: stats.total || 0,
      icon: ChartBarIcon,
      color: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Downloading',
      value: stats.downloading || 0,
      icon: ArrowDownIcon,
      color: 'bg-green-500',
      textColor: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'Completed',
      value: stats.completed || 0,
      icon: CheckCircleIcon,
      color: 'bg-purple-500',
      textColor: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      title: 'Seeding',
      value: stats.seeding || 0,
      icon: CloudIcon,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    {
      title: 'Paused',
      value: stats.paused || 0,
      icon: PauseIcon,
      color: 'bg-gray-500',
      textColor: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    },
  ];

  const speedStats = [
    {
      title: 'Download Speed',
      value: formatSpeed(stats.totalDownloadRate || 0),
      icon: ArrowDownIcon,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Upload Speed',
      value: formatSpeed(stats.totalUploadRate || 0),
      icon: ArrowUpIcon,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
  ];

  const dataStats = [
    {
      title: 'Total Size',
      value: formatBytes(stats.totalSize || 0),
      subtitle: 'All torrents',
    },
    {
      title: 'Downloaded',
      value: formatBytes(stats.totalDownloaded || 0),
      subtitle: `${stats.totalSize > 0 ? ((stats.totalDownloaded / stats.totalSize) * 100).toFixed(1) : 0}% complete`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Torrent Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`${stat.bgColor} overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700`}
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`${stat.color} p-2 rounded-md`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        {stat.title}
                      </dt>
                      <dd className={`text-2xl font-semibold ${stat.textColor}`}>
                        {stat.value}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Speed and Data Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Speed Stats */}
        <div className="bg-white dark:bg-gray-800 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              Transfer Speeds
            </h3>
            <div className="space-y-4">
              {speedStats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`${stat.bgColor} p-2 rounded-md mr-3`}>
                        <Icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {stat.title}
                      </span>
                    </div>
                    <span className={`text-lg font-semibold ${stat.color}`}>
                      {stat.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Data Stats */}
        <div className="bg-white dark:bg-gray-800 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              Data Statistics
            </h3>
            <div className="space-y-4">
              {dataStats.map((stat, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {stat.title}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {stat.subtitle}
                    </p>
                  </div>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            {stats.totalSize > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span>Overall Progress</span>
                  <span>{((stats.totalDownloaded / stats.totalSize) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min((stats.totalDownloaded / stats.totalSize) * 100, 100)}%`
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsOverview;