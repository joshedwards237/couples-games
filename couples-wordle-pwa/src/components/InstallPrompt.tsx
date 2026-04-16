import { Button } from './Button';
import { Card } from './Card';

interface Props {
  onDismiss: () => void;
}

export function InstallPrompt({ onDismiss }: Props) {
  return (
    <Card className="bg-white/90 backdrop-blur space-y-2">
      <p className="text-sm font-semibold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
        Add to Home Screen
      </p>
      <ol className="text-xs text-textSecondary list-decimal list-inside space-y-1">
        <li>Tap the Share button in Safari.</li>
        <li>Choose “Add to Home Screen”.</li>
        <li>Open from your Home Screen for full-screen play and notifications.</li>
      </ol>
      <Button variant="ghost" onClick={onDismiss} className="w-full">
        Got it
      </Button>
    </Card>
  );
}
