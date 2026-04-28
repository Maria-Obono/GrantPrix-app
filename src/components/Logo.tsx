import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  mdSize?: number;
  variant?: 'default' | 'white' | 'dark';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ 
  className = '', 
  size = 32, 
  mdSize,
  variant = 'default',
  showText = true
}) => {
  const colors = {
    default: {
      bg: '#C1FF72',
      icon: '#121212'
    },
    white: {
      bg: '#FFFFFF',
      icon: '#121212'
    },
    dark: {
      bg: '#121212',
      icon: '#C1FF72'
    }
  };

  const current = colors[variant];

  return (
    <div 
      className={`flex items-center gap-3 ${className}`}
      style={{ 
        '--logo-size': `${size}px`,
        '--logo-md-size': `${mdSize || size}px`
      } as React.CSSProperties}
    >
      <div 
        className="relative flex items-center justify-center rounded-[12px] shadow-[0_0_20px_rgba(193,255,114,0.2)] transition-all w-[var(--logo-size)] h-[var(--logo-size)] md:w-[var(--logo-md-size)] md:h-[var(--logo-md-size)]"
        style={{ backgroundColor: current.bg }}
      >
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-[70%] h-[70%]"
        >
          {/* Trophy in the background */}
          <path 
            d="M18 2H6V4H4V9C4 11.21 5.79 13 8 13H9.17C9.58 14.73 10.93 16.1 12.67 16.4V19H10V21H14V19H11.33V16.4C13.07 16.1 14.42 14.73 14.83 13H16C18.21 13 20 11.21 20 9V4H18V2ZM6 9V6H8V11C6.9 11 6 10.1 6 9ZM18 9C18 10.1 17.1 11 16 11V6H18V9Z" 
            fill={current.icon}
            fillOpacity="0.2"
          />
          {/* Bold G in the foreground */}
          <path 
            d="M12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12V10H12V13H15C14.5 14.5 13.5 15.5 12 15.5C10.07 15.5 8.5 13.93 8.5 12C8.5 10.07 10.07 8.5 12 8.5C13.1 8.5 14.1 9 14.8 9.8L16.6 8C15.4 6.8 13.8 6 12 6Z" 
            fill={current.icon}
          />
        </svg>
      </div>
      {showText && (
        <span 
          className={`font-bold tracking-tighter uppercase ${variant === 'dark' ? 'text-white' : ''} text-[calc(var(--logo-size)*0.7)] md:text-[calc(var(--logo-md-size)*0.7)]`}
        >
          GrantPrix
        </span>
      )}
    </div>
  );
};
