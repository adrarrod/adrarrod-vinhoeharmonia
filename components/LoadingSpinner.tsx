
import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex justify-center items-center h-full w-full">
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-rose-300"></div>
    </div>
  );
};

export default LoadingSpinner;
