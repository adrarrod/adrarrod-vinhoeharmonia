import React from 'react';
import { WineGlassIcon, CartIcon } from './icons';

interface HeaderProps {
  cartItemCount: number;
  onCartClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ cartItemCount, onCartClick }) => {
  return (
    <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 shadow-lg shadow-slate-950/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center space-x-3">
            <WineGlassIcon className="h-8 w-8 text-rose-300" />
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-rose-100 tracking-wider">
              Vinho & Harmonia
            </h1>
          </div>
          <button
            onClick={onCartClick}
            className="relative p-2 text-rose-200 hover:text-white hover:bg-rose-900/50 rounded-full transition-colors duration-300"
            aria-label="Open shopping cart"
          >
            <CartIcon className="h-7 w-7" />
            {cartItemCount > 0 && (
              <span className="absolute top-0 right-0 block h-5 w-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center transform translate-x-1/4 -translate-y-1/4 ring-2 ring-slate-900">
                {cartItemCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;