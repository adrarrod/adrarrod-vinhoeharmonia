
export interface Wine {
  id: number;
  name: string;
  type: 'Tinto' | 'Branco' | 'Rosé' | 'Espumante';
  region: string;
  price: number;
  imageUrl: string;
  description: string;
}

export interface CartItem extends Wine {
  quantity: number;
}
