import React, { useState } from 'react';
import { Trash2, Plus, Edit2, Check, X } from 'lucide-react';
import { useCoreStore } from '../integration/store/coreStore';
import type { PortfolioHolding } from '../integration/store/coreStore';

export const PortfolioPanel: React.FC = () => {
  const { portfolio, addPortfolioHolding, updatePortfolioHolding, removePortfolioHolding } = useCoreStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    symbol: '',
    quantity: '',
    averagePrice: '',
  });

  const handleAdd = () => {
    if (
      !formData.symbol.trim() ||
      !formData.quantity ||
      !formData.averagePrice
    ) {
      return;
    }

    addPortfolioHolding({
      symbol: formData.symbol.toUpperCase(),
      quantity: Number(formData.quantity),
      averagePrice: Number(formData.averagePrice),
    });

    setFormData({ symbol: '', quantity: '', averagePrice: '' });
    setIsEditing(false);
  };

  const handleEdit = (holding: PortfolioHolding) => {
    setEditingId(holding.id);
    setFormData({
      symbol: holding.symbol,
      quantity: String(holding.quantity),
      averagePrice: String(holding.averagePrice),
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;

    if (
      !formData.symbol.trim() ||
      !formData.quantity ||
      !formData.averagePrice
    ) {
      return;
    }

    updatePortfolioHolding(editingId, {
      symbol: formData.symbol.toUpperCase(),
      quantity: Number(formData.quantity),
      averagePrice: Number(formData.averagePrice),
    });

    setFormData({ symbol: '', quantity: '', averagePrice: '' });
    setEditingId(null);
  };

  const handleCancel = () => {
    setFormData({ symbol: '', quantity: '', averagePrice: '' });
    setEditingId(null);
    setIsEditing(false);
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Portfolio Holdings</h3>
        {!isEditing && !editingId && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        )}
      </div>

      {/* Form */}
      {(isEditing || editingId) && (
        <div className="border border-zinc-200 rounded-lg p-3 space-y-2 bg-zinc-50">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Symbol"
              value={formData.symbol}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  symbol: e.target.value,
                })
              }
              className="px-2 py-1 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Quantity"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  quantity: e.target.value,
                })
              }
              className="px-2 py-1 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Avg Price"
              step="0.01"
              value={formData.averagePrice}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  averagePrice: e.target.value,
                })
              }
              className="px-2 py-1 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              <X size={14} />
              Cancel
            </button>
            <button
              onClick={editingId ? handleUpdate : handleAdd}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
            >
              <Check size={14} />
              {editingId ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Holdings List */}
      {portfolio.length === 0 ? (
        <p className="text-xs text-zinc-400">No holdings yet.</p>
      ) : (
        <div className="space-y-2">
          {portfolio.map((holding) => (
            <div
              key={holding.id}
              className="flex items-center justify-between p-2 border border-zinc-200 rounded bg-zinc-50"
            >
              <div>
                <p className="text-xs font-semibold text-zinc-900">
                  {holding.symbol}
                </p>
                <p className="text-xs text-zinc-500">
                  {holding.quantity} @ ₹{holding.averagePrice.toFixed(2)}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(holding)}
                  className="p-1 text-zinc-400 hover:text-blue-600 transition-colors"
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() =>
                    removePortfolioHolding(holding.id)
                  }
                  className="p-1 text-zinc-400 hover:text-red-600 transition-colors"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
