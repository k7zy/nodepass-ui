'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
  align?: 'start' | 'end' | 'center' | 'baseline' | 'stretch';
  direction?: 'row' | 'row-reverse' | 'col' | 'col-reverse';
  wrap?: 'wrap' | 'wrap-reverse' | 'nowrap';
  gap?: number;
  className?: string;
  children?: React.ReactNode;
  flex?: number | string;
  w?: 'full' | 'auto' | number | string;
  h?: 'full' | 'auto' | number | string;
}

const Flex: React.FC<FlexProps> = ({
  justify = 'start',
  align = 'start',
  direction = 'row',
  wrap = 'nowrap',
  gap = 0,
  className,
  children,
  flex,
  w,
  h,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex',
        `justify-${justify}`,
        `items-${align}`,
        direction.startsWith('col') ? `flex-${direction}` : `flex-${direction}`,
        `flex-${wrap}`,
        gap && `gap-${gap}`,
        flex && (typeof flex === 'number' ? `flex-${flex}` : `flex-[${flex}]`),
        w && (typeof w === 'number' ? `w-${w}` : w === 'full' ? 'w-full' : w === 'auto' ? 'w-auto' : `w-[${w}]`),
        h && (typeof h === 'number' ? `h-${h}` : h === 'full' ? 'h-full' : h === 'auto' ? 'h-auto' : `h-[${h}]`),
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default Flex; 