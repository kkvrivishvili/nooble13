import { PublicWidgetProps } from './types';
import BaseWidget from './BaseWidget';

interface PublicTitleWidgetProps extends PublicWidgetProps {
  data: {
    text: string;
    fontSize: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
    textAlign: 'left' | 'center' | 'right';
    fontWeight: 'normal' | 'medium' | 'semibold' | 'bold';
  };
  theme?: any;
}

export function PublicTitleWidget({ data, theme, className }: PublicTitleWidgetProps) {
  const sizeClasses = {
    'sm': 'text-sm',
    'md': 'text-base',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
  };
  
  const weightClasses = {
    'normal': 'font-normal',
    'medium': 'font-medium',
    'semibold': 'font-semibold',
    'bold': 'font-bold',
  };
  
  const alignClasses = {
    'left': 'text-left',
    'center': 'text-center',
    'right': 'text-right',
  };

  return (
    <BaseWidget.Text
      theme={theme}
      variant="primary"
      className={`
        ${sizeClasses[data.fontSize]}
        ${weightClasses[data.fontWeight]}
        ${alignClasses[data.textAlign]}
        ${className}
      `}
      as="h2"
    >
      {data.text}
    </BaseWidget.Text>
  );
}