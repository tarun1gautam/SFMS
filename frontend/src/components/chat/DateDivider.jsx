import React from 'react';

function DateDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4 select-none">
      <div className="flex-1 h-px bg-line dark:bg-gray-800" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-faint bg-surface dark:bg-gray-900 px-2">
        {label}
      </span>
      <div className="flex-1 h-px bg-line dark:bg-gray-800" />
    </div>
  );
}

export default React.memo(DateDivider);