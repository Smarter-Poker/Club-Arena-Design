import './TermsGate.css';

interface TermsGateProps {
  children: React.ReactNode;
  onAccept?: () => void;
}

// TEMPORARILY DISABLED - just returns children directly
export default function TermsGate({ children }: TermsGateProps) {
  return <>{children}</>;
}

export { TermsGate };
