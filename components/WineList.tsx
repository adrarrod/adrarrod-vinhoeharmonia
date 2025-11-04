
import React from 'react';
import { Wine } from '../types';
import WineCard from './WineCard';

interface WineListProps {
  wines: Wine[];
  onAddToCart: (wine: Wine) => void;
}

const WineList: React.FC<WineListProps> = ({ wines, onAddToCart }) => {
  if (wines.length === 0) {
    return <div className="text-center py-20 text-gray-400">Nenhum vinho encontrado.</div>;
  }
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {wines.map((wine) => (
          <WineCard key={wine.id} wine={wine} onAddToCart={onAddToCart} />
        ))}
      </div>
    </div>
  );
};

export default WineList;
