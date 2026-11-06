import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** A router link that looks like a Button (for navigation actions). */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  ...rest
}: ButtonLinkProps) {
  return <Link className={cn(buttonClasses(variant, size, fullWidth), className)} {...rest} />;
}
