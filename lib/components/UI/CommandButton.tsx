import React, { forwardRef } from 'react';

const CommandButton = forwardRef(({ 
  children, 
  title, 
  onClick,
  active = false,
  disabled = false
}: { 
  children: React.ReactNode, 
  title: string, 
  onClick?: () => void,
  active?: boolean,
  disabled?: boolean
}, ref: React.Ref<HTMLButtonElement>) => {
  return (
    <button
      ref={ref}
      title={title}
      disabled={disabled}
      style={{
        background: active ? '#e1e6f0' : 'none',
        border: 'none',
        borderRadius: 8,
        padding: '6px 10px',
        margin: '0 2px',
        minWidth: 32,
        minHeight: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseOver={e => !active && !disabled && (e.currentTarget.style.background = '#ececec')}
      onMouseOut={e => !active && !disabled && (e.currentTarget.style.background = 'none')}
      onClick={!disabled ? onClick : undefined}
    >
      {children}
    </button>
  );
});
CommandButton.displayName = 'CommandButton';

export default CommandButton; 