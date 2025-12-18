import React from 'react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
  preview?: React.ReactNode;
}

interface StyleSelectorProps {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StyleSelector({ 
  label, 
  value, 
  options, 
  onChange, 
  columns = 3,
  className 
}: StyleSelectorProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div className={className}>
      <h4 className="font-medium mb-3">{label}</h4>
      <div className={cn("grid gap-3", gridCols[columns])}>
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "p-4 border rounded-lg transition-all hover:shadow-md",
              value === option.value 
                ? "border-blue-500 bg-blue-50" 
                : "border-gray-200"
            )}
          >
            {option.icon && (
              <div className="flex justify-center mb-2">
                {option.icon}
              </div>
            )}
            {option.preview && (
              <div className="mb-2">
                {option.preview}
              </div>
            )}
            <p className="text-sm font-medium capitalize">{option.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}