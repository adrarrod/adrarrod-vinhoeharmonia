import React from 'react';
import { CartItem } from '../types';
import { CloseIcon, TrashIcon } from './icons';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onRemoveItem: (id: number) => void;
  onCheckout: () => void;
}

const Cart: React.FC<CartProps> = ({
  isOpen,
  onClose,
  cartItems,
  onRemoveItem,
  onCheckout,
}) => {
  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-slate-800 text-gray-200 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-heading"
      >
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-6 border-b border-slate-700">
            <h2 id="cart-heading" className="text-2xl font-serif font-semibold text-rose-200">Seu Carrinho</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-full transition-colors"
              aria-label="Close cart"
            >
              <CloseIcon className="h-6 w-6" />
            </button>
          </div>
          {cartItems.length === 0 ? (
            <div className="flex-grow flex flex-col justify-center items-center text-gray-400 p-4 text-center">
              <p>Seu carrinho está vazio.</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-rose-800 text-white rounded-md hover:bg-rose-700 transition-colors"
              >
                Continuar Comprando
              </button>
            </div>
          ) : (
            <>
              <div className="flex-grow overflow-y-auto p-6 space-y-4">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-center space-x-4">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-20 h-20 object-cover rounded-md"
                    />
                    <div className="flex-grow">
                      <p className="font-semibold text-rose-100">{item.name}</p>
                      <p className="text-sm text-gray-400">
                        {item.quantity} x {formatPrice(item.price)}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-slate-700 rounded-full"
                      aria-label={`Remove ${item.name}`}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-slate-700 space-y-4">
                <div className="flex justify-between font-semibold">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <button 
                  onClick={onCheckout}
                  className="w-full bg-rose-600 text-white py-3 rounded-md text-lg font-bold hover:bg-rose-500 transition-colors duration-300"
                >
                  Finalizar Compra
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default Cart;
