import React from 'react';

function UserAvatar({ name, isOnline, size = 'md' }) {
  const initials = (name || 'U').substring(0, 2).toUpperCase();

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
  }[size] || 'w-9 h-9 text-xs';

  return (
    <div className="relative inline-block shrink-0">
      <div className={`${sizeClasses} rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold flex items-center justify-center shadow-sm uppercase tracking-wider`}>
        {initials}
      </div>
      {isOnline && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-surface dark:border-gray-900 rounded-full" />
      )}
    </div>
  );
}

export default React.memo(UserAvatar);