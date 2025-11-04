import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import Cart from './components/Cart';
import WineCard from './components/WineCard';
import { getWineRecommendations } from './services/geminiService';
import { INITIAL_WINES } from './constants';
import { Wine, CartItem } from './types';
import { SendIcon, CloseIcon } from './components/icons';

type Message = {
  id: number;
  sender: 'user' | 'bot' | 'recommendation';
  content: string | Wine[];
};

const App: React.FC = () => {
  const [userName, setUserName] = useState<string>('');
  const [step, setStep] = useState<'name' | 'chat'>('name');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleNameSubmit = (name: string) => {
    setUserName(name);
    setStep('chat');
    setMessages([
      {
        id: 1,
        sender: 'bot',
        content: `Olá ${name}, seja bem-vindo(a) à Vinho & Harmonia! Sou seu sommelier digital. Que tipo de vinho você procura ou para qual ocasião?`,
      },
    ]);
  };

  const handleSendMessage = async (userInput: string) => {
    if (!userInput.trim() || isLoading) return;

    const newUserMessage: Message = {
      id: Date.now(),
      sender: 'user',
      content: userInput,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const recommendations = await getWineRecommendations(userInput, userName, INITIAL_WINES);
      if (recommendations && recommendations.length > 0) {
        const botResponse: Message = {
          id: Date.now() + 1,
          sender: 'bot',
          content: 'Excelente escolha! Com base no seu pedido, separei estas 3 opções especiais para você:',
        };
        const recommendationMessage: Message = {
          id: Date.now() + 2,
          sender: 'recommendation',
          content: recommendations,
        };
        setMessages((prev) => [...prev, botResponse, recommendationMessage]);
      } else {
        const errorMessage: Message = {
          id: Date.now() + 1,
          sender: 'bot',
          content: 'Peço desculpas, mas não consegui encontrar uma recomendação ideal com base no seu pedido. Poderia tentar descrever de outra forma?',
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        sender: 'bot',
        content: 'Ocorreu um erro ao buscar as recomendações. Por favor, tente novamente.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCart = useCallback((wineToAdd: Wine) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === wineToAdd.id);
      if (existingItem) {
        return prevItems.map((item) =>
          item.id === wineToAdd.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevItems, { ...wineToAdd, quantity: 1 }];
    });
    setIsCartOpen(true);
  }, []);

  const handleRemoveFromCart = useCallback((id: number) => {
    setCartItems((prevItems) => {
      const itemToRemove = prevItems.find(item => item.id === id);
      if (itemToRemove && itemToRemove.quantity > 1) {
        return prevItems.map(item => item.id === id ? { ...item, quantity: item.quantity - 1 } : item);
      }
      return prevItems.filter((item) => item.id !== id);
    });
  }, []);

  const cartItemCount = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);
  
  const handleCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };
  
  const handleOrderSubmit = (customerDetails: {email: string, phone: string}) => {
    const formatPrice = (price: number) => price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const subtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

    const subject = "Pedido feito pelo APP";
    const body = `
Olá,

Um novo pedido foi realizado através do aplicativo.

Detalhes do Cliente:
Nome: ${userName}
Email: ${customerDetails.email}
Telefone: ${customerDetails.phone}

Itens do Pedido:
${cartItems.map(item => `- ${item.name} (x${item.quantity}) - ${formatPrice(item.price * item.quantity)}`).join('\n')}

Subtotal: ${formatPrice(subtotal)}

Atenciosamente,
App Vinho & Harmonia
    `;
    
    window.location.href = `mailto:contato@vinhoeharmonia.com.br?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    setIsCheckoutOpen(false);
    setCartItems([]);
    setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'bot',
        content: 'Seu pedido foi preparado para envio! Agradecemos a sua preferência. Posso ajudar com mais alguma coisa?'
    }]);
  };


  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 font-sans flex flex-col">
      {step === 'chat' && <Header cartItemCount={cartItemCount} onCartClick={() => setIsCartOpen(true)} />}
      <main className="flex-grow flex flex-col">
        {step === 'name' && <NamePrompt onNameSubmit={handleNameSubmit} />}
        {step === 'chat' && (
          <ChatUI 
            messages={messages} 
            isLoading={isLoading} 
            onSendMessage={handleSendMessage} 
            onAddToCart={handleAddToCart}
            chatEndRef={chatEndRef}
          />
        )}
      </main>
      {step === 'chat' && (
        <>
            <Cart
                isOpen={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                cartItems={cartItems}
                onRemoveItem={handleRemoveFromCart}
                onCheckout={handleCheckout}
            />
            <CheckoutModal 
                isOpen={isCheckoutOpen}
                onClose={() => setIsCheckoutOpen(false)}
                onSubmit={handleOrderSubmit}
                cartItems={cartItems}
            />
        </>
      )}
    </div>
  );
};


const NamePrompt: React.FC<{ onNameSubmit: (name: string) => void }> = ({ onNameSubmit }) => {
  const [name, setName] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onNameSubmit(name.trim());
    }
  };
  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-900 to-slate-800">
      <h1 className="text-4xl sm:text-5xl font-serif font-bold text-rose-100 tracking-wider mb-4">Vinho & Harmonia</h1>
      <p className="text-rose-200/80 mb-8 max-w-md">Para começar, qual o seu nome?</p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Digite seu nome aqui"
          className="flex-grow bg-slate-800 border border-slate-600 text-rose-200 rounded-lg p-3 focus:ring-rose-500 focus:border-rose-500"
          aria-label="Your name"
        />
        <button type="submit" className="bg-rose-800 text-white px-6 py-3 rounded-lg hover:bg-rose-700 transition-colors duration-300 font-semibold">
          Entrar
        </button>
      </form>
    </div>
  );
};

const ChatUI: React.FC<{
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (input: string) => void;
  onAddToCart: (wine: Wine) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}> = ({ messages, isLoading, onSendMessage, onAddToCart, chatEndRef }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex-grow flex flex-col h-[calc(100vh-80px)]">
      <div className="flex-grow overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.sender === 'bot' && (
              <div className="flex gap-3 max-w-2xl">
                <div className="text-xl bg-rose-900/50 rounded-full h-10 w-10 flex-shrink-0 flex items-center justify-center font-serif text-rose-200">H</div>
                <div className="bg-slate-800/80 rounded-lg p-4 text-rose-100/90">{msg.content as string}</div>
              </div>
            )}
            {msg.sender === 'user' && (
              <div className="flex justify-end">
                <div className="bg-rose-800/90 rounded-lg p-4 text-white max-w-2xl">{msg.content as string}</div>
              </div>
            )}
            {msg.sender === 'recommendation' && (
              <div className="space-y-6 my-4">
                {(msg.content as Wine[]).map((wine) => (
                    <div key={wine.id} className="bg-slate-800/50 rounded-lg p-5 border border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex-grow">
                            <h3 className="text-lg font-serif font-semibold text-rose-100">{wine.name}</h3>
                            <p className="text-sm text-gray-300 mt-2">{wine.description}</p>
                        </div>
                        <div className="flex-shrink-0 flex flex-col sm:items-end gap-2 sm:gap-4 mt-4 sm:mt-0">
                            <p className="text-xl font-bold text-rose-300">
                                {wine.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <button
                                onClick={() => onAddToCart(wine)}
                                className="bg-rose-800 text-white px-4 py-2 rounded-md hover:bg-rose-700 transition-colors duration-300 text-sm font-semibold w-full sm:w-auto"
                            >
                                Adicionar
                            </button>
                        </div>
                    </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
           <div className="flex gap-3 max-w-2xl">
                <div className="text-xl bg-rose-900/50 rounded-full h-10 w-10 flex-shrink-0 flex items-center justify-center font-serif text-rose-200">H</div>
                <div className="bg-slate-800/80 rounded-lg p-4 flex items-center space-x-2">
                    <div className="w-2 h-2 bg-rose-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-rose-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-rose-300 rounded-full animate-pulse"></div>
                </div>
            </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 sm:p-6 lg:p-8 bg-slate-900/80 backdrop-blur-md border-t border-slate-700">
        <form onSubmit={handleSubmit} className="flex items-center gap-3 container mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Descreva o vinho ou a ocasião..."
            className="flex-grow bg-slate-800 border border-slate-600 text-rose-200 rounded-lg p-3 focus:ring-rose-500 focus:border-rose-500"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="bg-rose-800 text-white p-3 rounded-lg hover:bg-rose-700 transition-colors duration-300 disabled:bg-slate-700 disabled:cursor-not-allowed">
            <SendIcon className="h-6 w-6" />
          </button>
        </form>
      </div>
    </div>
  );
};


const CheckoutModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (details: { email: string, phone: string }) => void;
    cartItems: CartItem[];
}> = ({ isOpen, onClose, onSubmit, cartItems }) => {
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({ email, phone });
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-800 text-gray-200 shadow-2xl z-50 rounded-lg">
                <div className="flex justify-between items-center p-6 border-b border-slate-700">
                    <h2 className="text-2xl font-serif font-semibold text-rose-200">Finalizar Pedido</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors" aria-label="Close checkout">
                        <CloseIcon className="h-6 w-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <p className="text-rose-100/90">Para concluir, por favor, informe seu e-mail e telefone. Um e-mail será preparado para finalizar seu pedido.</p>
                        <div>
                            <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-300">Email</label>
                            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg focus:ring-rose-500 focus:border-rose-500 block w-full p-2.5" placeholder="seuemail@exemplo.com" required />
                        </div>
                        <div>
                            <label htmlFor="phone" className="block mb-2 text-sm font-medium text-gray-300">Telefone</label>
                            <input type="tel" id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg focus:ring-rose-500 focus:border-rose-500 block w-full p-2.5" placeholder="(XX) XXXXX-XXXX" required />
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-700">
                         <button type="submit" className="w-full bg-rose-600 text-white py-3 rounded-md text-lg font-bold hover:bg-rose-500 transition-colors duration-300">
                            Confirmar Pedido
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
};


export default App;