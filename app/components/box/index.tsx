'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
  padding?: number | string;
  margin?: number | string;
  radius?: number | string;
  shadow?: boolean;
  bordered?: boolean;
}

const Box: React.FC<BoxProps> = ({
  className,
  children,
  padding = 4,
  margin,
  radius = 'lg',
  shadow = false,
  bordered = false,
  ...props
}) => {
  return (
    <div
      className={cn(
        'bg-background',
        typeof padding === 'number' ? `p-${padding}` : `p-${padding}`,
        typeof margin === 'number' ? `m-${margin}` : margin && `m-${margin}`,
        typeof radius === 'number' ? `rounded-${radius}` : `rounded-${radius}`,
        shadow && 'shadow-lg',
        bordered && 'border border-default-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default Box; 