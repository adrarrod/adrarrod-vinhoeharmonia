
import React from 'react';

interface FilterSortProps {
  filterType: string;
  setFilterType: (type: string) => void;
  sortOrder: string;
  setSortOrder: (order: string) => void;
}

const wineTypes = ['Todos', 'Tinto', 'Branco', 'Rosé', 'Espumante'];

const FilterSort: React.FC<FilterSortProps> = ({
  filterType,
  setFilterType,
  sortOrder,
  setSortOrder,
}) => {
  const commonSelectClass = "bg-slate-800 border border-slate-600 text-rose-200 text-sm rounded-lg focus:ring-rose-500 focus:border-rose-500 block w-full p-2.5 appearance-none";
  
  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 bg-slate-900/50 sticky top-20 z-20 backdrop-blur-sm">
      <div className="container mx-auto">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
            <div className="flex items-center gap-2">
                <label htmlFor="filterType" className="text-sm font-medium text-gray-300">Filtrar por tipo:</label>
                <div className="relative">
                    <select
                        id="filterType"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className={commonSelectClass}
                    >
                        {wineTypes.map((type) => (
                        <option key={type} value={type}>
                            {type}
                        </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="sortOrder" className="text-sm font-medium text-gray-300">Ordenar por preço:</label>
                 <div className="relative">
                    <select
                        id="sortOrder"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        className={commonSelectClass}
                    >
                        <option value="default">Padrão</option>
                        <option value="asc">Menor para Maior</option>
                        <option value="desc">Maior para Menor</option>
                    </select>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default FilterSort;
