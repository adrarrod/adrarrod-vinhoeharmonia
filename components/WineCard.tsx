import React from 'react';
import { Wine } from '../types';

interface WineCardProps {
  wine: Wine;
  onAddToCart: (wine: Wine) => void;
}

const WineCard: React.FC<WineCardProps> = ({ wine, onAddToCart }) => {
  const typeColorMap = {
    Tinto: 'bg-red-900/50 text-red-200',
    Branco: 'bg-yellow-200/50 text-yellow-800',
    Rosé: 'bg-rose-300/50 text-rose-800',
    Espumante: 'bg-amber-300/50 text-amber-800',
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="bg-slate-800/50 rounded-lg overflow-hidden shadow-lg hover:shadow-rose-400/20 transition-all duration-300 flex flex-col group border border-slate-700 hover:border-rose-400/30">
      <div className="relative">
        <img
          src={wine.imageUrl}
          alt={wine.name}
          className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div
          className={`absolute top-2 right-2 px-3 py-1 text-xs font-semibold rounded-full ${
            typeColorMap[wine.type] || 'bg-gray-500/50 text-gray-100'
          } backdrop-blur-sm`}
        >
          {wine.type}
        </div>
      </div>
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-lg font-serif font-semibold text-rose-100 h-14">{wine.name}</h3>
        <p className="text-sm text-rose-200/60 mb-3">{wine.region}</p>
        <p className="text-sm text-gray-300 flex-grow mb-4">{wine.description}</p>
        <div className="mt-auto flex justify-between items-center">
          <p className="text-xl font-bold text-rose-300">{formatPrice(wine.price)}</p>
          <button
            onClick={() => onAddToCart(wine)}
            className="bg-rose-800 text-white px-4 py-2 rounded-md hover:bg-rose-700 transition-colors duration-300 transform hover:scale-105 text-sm font-semibold"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
};

export default WineCard;
