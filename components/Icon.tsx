import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';

interface IconProps {
  icon?: string;
  as?: React.ComponentType<any>;
  className?: string;
  width?: number | string;
  height?: number | string;
  size?: number | string;
  style?: React.CSSProperties;
  set?: string;
  primaryColor?: string;
  secondaryColor?: string;
  stroke?: string;
}

export const Icon: React.FC<IconProps> = ({ 
  icon, 
  as: Component,
  className, 
  width, 
  height, 
  size,
  style,
  set,
  primaryColor,
  secondaryColor,
  stroke,
  ...props 
}) => {
  // 如果传入了 as 属性，使用 react-iconly 组件
  if (Component) {
    return (
      <Component
        set={set}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        stroke={stroke}
        size={size}
        style={style}
        className={className}
        {...props}
      />
    );
  }
  
  // 否则使用 iconify 图标
  const iconSize = size || width || height || 24;
  
  return (
    <IconifyIcon
      icon={icon!}
      className={className}
      width={iconSize}
      height={iconSize}
      style={style}
      {...props}
    />
  );
};