function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

const variantClasses = {
  default: 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm',
  primary: 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm',
  secondary: 'bg-zinc-700 text-white hover:bg-zinc-600',
  ghost: 'bg-transparent text-zinc-200 hover:bg-white/10',
  outline: 'border border-zinc-600 bg-transparent text-white hover:bg-zinc-800',
};

const sizeClasses = {
  default: 'h-9 px-4 py-2 text-sm rounded-md',
  lg: 'h-11 px-6 text-base rounded-lg',
  sm: 'h-8 px-3 text-sm rounded-md',
};

export function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant] || variantClasses.default,
        sizeClasses[size] || sizeClasses.default,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
